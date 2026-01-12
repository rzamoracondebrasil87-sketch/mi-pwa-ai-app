import React, { useState, useRef, useEffect } from 'react';
import { callGeminiAPI } from '../services/geminiService';
import { useTranslation } from '../services/i18n';
import { useToast } from './Toast';
import { logger } from '../services/logger';
import { WeighingRecord } from '../types';

interface GlobalWeighingChatProps {
    isVisible: boolean;
    onToggle: () => void;
    records?: WeighingRecord[];
}

export const GlobalWeighingChat: React.FC<GlobalWeighingChatProps> = ({ isVisible, onToggle, records = [] }) => {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
        {
            role: 'assistant',
            text: '¿Dudas sobre pesaje, tara, diferencias de peso o buenas prácticas? Estoy aquí para ayudarte.'
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);

    // Build context from records
    const getHistorialContext = () => {
        if (records.length === 0) return '';
        
        const recentRecords = records.slice(-10); // Last 10 records
        const stats = {
            totalRecords: records.length,
            avgDifference: (recentRecords.reduce((sum, r) => sum + (r.netWeight - r.noteWeight), 0) / recentRecords.length).toFixed(2),
            commonSuppliers: [...new Set(recentRecords.map(r => r.supplier))].slice(0, 3),
            commonProducts: [...new Set(recentRecords.map(r => r.product))].slice(0, 3),
        };

        return `HISTORIAL CONTEXT:
- Total registros: ${stats.totalRecords}
- Promedio diferencia reciente: ${stats.avgDifference}kg
- Proveedores: ${stats.commonSuppliers.join(', ')}
- Productos: ${stats.commonProducts.join(', ')}`;
    };

    // IA - Detect anomalies silently
    const detectAnomalies = () => {
        if (records.length < 2) return null;
        
        const anomalies: string[] = [];
        const lastRecord = records[records.length - 1];
        const historicRecords = records.slice(-20).slice(0, -1); // Last 20, excluding current
        
        // Check tara anomaly
        const sameProductRecords = historicRecords.filter(r => r.product === lastRecord.product && r.supplier === lastRecord.supplier);
        if (sameProductRecords.length > 0) {
            const avgHistoricTara = sameProductRecords.reduce((sum, r) => sum + r.taraTotal, 0) / sameProductRecords.length;
            const taraDeviation = Math.abs((lastRecord.taraTotal - avgHistoricTara) / avgHistoricTara);
            
            if (taraDeviation > 0.2) { // 20% deviation
                anomalies.push(`⚠️ A IA detectou uma tara fora do padrão habitual (${(taraDeviation * 100).toFixed(0)}% diferença)`);
            }
        }
        
        // Check weight difference anomaly
        if (Math.abs(lastRecord.netWeight - lastRecord.noteWeight) > 0.5) {
            anomalies.push(`⚠️ Diferença incomum entre bruto, nota e tara (${Math.abs(lastRecord.netWeight - lastRecord.noteWeight).toFixed(2)}kg)`);
        }
        
        // Check quantity anomaly
        if (sameProductRecords.length > 0 && lastRecord.boxes) {
            const avgQty = sameProductRecords.reduce((sum, r) => sum + (r.boxes?.qty || 0), 0) / sameProductRecords.length;
            const qtyDeviation = Math.abs((lastRecord.boxes.qty - avgQty) / (avgQty || 1));
            
            if (qtyDeviation > 0.3) { // 30% deviation
                anomalies.push(`💡 Normalmente este produto usa ${Math.round(avgQty)} caixas. Hoje foram ${lastRecord.boxes.qty}`);
            }
        }
        
        return anomalies.length > 0 ? anomalies : null;
    };

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Initialize speech recognition
    useEffect(() => {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'es-ES';

            recognition.onstart = () => setIsListening(true);
            recognition.onend = () => setIsListening(false);

            recognition.onresult = (event: any) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                if (transcript) {
                    setInput(transcript);
                }
            };

            recognition.onerror = (event: any) => {
                logger.error('Speech recognition error:', event.error);
                showToast('Error en micrófono: ' + event.error, 'error');
            };

            recognitionRef.current = recognition;
        }
    }, []);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setLoading(true);

        try {
            const historialContext = getHistorialContext();
            const prompt = `Eres un experto en pesaje y control de calidad. Ayuda con:
- Diferencias de peso y tolerancias
- Explicación de Tara, Bruto, Nota, Peso Neto
- Anomalías y errores en pesaje
- Buenas prácticas de pesaje
- Regulaciones internacionales

${historialContext}

Responde brevemente (máximo 2-3 oraciones) de forma clara y didáctica.
Idioma: español.`;

            const response = await callGeminiAPI(prompt + '\n\nPregunta: ' + userMessage);
            setMessages(prev => [...prev, { role: 'assistant', text: response }]);
        } catch (err) {
            logger.error('Chat error:', err);
            showToast('Error al conectar', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleMicrophone = () => {
        if (!recognitionRef.current) {
            showToast('Micrófono no disponible', 'error');
            return;
        }

        if (isListening) {
            recognitionRef.current.stop();
        } else {
            recognitionRef.current.start();
        }
    };

    return (
        <>
            {/* Floating Button */}
            {!isVisible && (
                <button
                    onClick={onToggle}
                    className="fixed bottom-28 right-6 z-40 w-14 h-14 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                    title="Asistente de pesaje"
                >
                    <span className="material-icons-round text-2xl pointer-events-none">smart_toy</span>
                </button>
            )}

            {/* Chat Modal */}
            {isVisible && (
                <div className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in">
                    <div
                        className="bg-white dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900 w-full max-w-sm rounded-t-[3rem] sm:rounded-[3rem] max-h-[80vh] flex flex-col shadow-2xl animate-slide-up"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-transparent">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <span className="material-icons-round text-primary-600">smart_toy</span>
                                Asistente Pesaje
                            </h3>
                            <button
                                onClick={onToggle}
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                            >
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {/* Anomaly Alerts (silent detection) */}
                            {detectAnomalies()?.map((anomaly, idx) => (
                                <div
                                    key={`anomaly-${idx}`}
                                    className="flex justify-start opacity-80"
                                >
                                    <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-2.5 rounded-2xl rounded-bl-none text-xs leading-relaxed text-amber-800 dark:text-amber-200 max-w-xs">
                                        {anomaly}
                                    </div>
                                </div>
                            ))}
                            
                            {messages.map((msg, idx) => (
                                <div
                                    key={idx}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-xs p-3 rounded-2xl text-sm leading-relaxed ${
                                            msg.role === 'user'
                                                ? 'bg-primary-600 text-white rounded-br-none'
                                                : 'bg-slate-100 dark:bg-slate-700/50 text-slate-800 dark:text-slate-200 rounded-bl-none'
                                        }`}
                                    >
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div className="flex justify-start">
                                    <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-2xl rounded-bl-none flex gap-1">
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 border-t border-slate-100 dark:border-transparent space-y-3">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyPress={e => e.key === 'Enter' && handleSend()}
                                    placeholder="Tu pregunta..."
                                    className="flex-1 bg-slate-100 dark:bg-slate-700/50 border-none rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-400 dark:text-white"
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    onClick={handleMicrophone}
                                    disabled={loading}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                                        isListening
                                            ? 'bg-red-500 text-white animate-pulse'
                                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                                    }`}
                                    title="Micrófono"
                                >
                                    <span className="material-icons-round text-lg pointer-events-none">
                                        {isListening ? 'mic' : 'mic_none'}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSend}
                                    disabled={loading || !input.trim()}
                                    className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white w-10 h-10 p-0 rounded-full transition-all flex items-center justify-center"
                                >
                                    <span className="material-icons-round text-sm pointer-events-none">send</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
