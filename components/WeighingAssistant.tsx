import React, { useState } from 'react';
import { WeighingRecord } from '../types';
import { useTranslation } from '../services/i18n';
import { useToast } from './Toast';
import { logger } from '../services/logger';

interface WeighingAssistantProps {
    record?: WeighingRecord;
    isOpen: boolean;
    onClose: () => void;
}

export const WeighingAssistant: React.FC<WeighingAssistantProps> = ({ record, isOpen, onClose }) => {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
        {
            role: 'assistant',
            text: '¿Tienes dudas sobre los pesos, la tara o el pesaje? Estoy aquí para ayudarte.'
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setLoading(true);

        // Simulate response delay
        setTimeout(() => {
            const responses = [
                'Peso neto = peso bruto - tara. La tara es el peso del embalaje.',
                'Verifica que la báscula esté calibrada correctamente.',
                'Para productos frescos, tolerancia típica es ±200g.',
                'La temperatura afecta el peso de algunos productos.',
                'Documenta siempre las diferencias encontradas.'
            ];
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            setMessages(prev => [...prev, { role: 'assistant', text: randomResponse }]);
            setLoading(false);
        }, 800);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in">
            <div
                className="bg-white dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900 w-full max-w-sm rounded-t-[3rem] sm:rounded-[3rem] max-h-[80vh] flex flex-col shadow-2xl animate-slide-up"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-transparent">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span className="material-icons-round text-primary-600">smart_toy</span>
                        Asistente de Pesaje
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                    >
                        <span className="material-icons-round">close</span>
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, idx) => (
                        <div
                            key={idx}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-xs p-3 rounded-2xl text-sm ${
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
                </div>

                {/* Input */}
                <div className="p-4 border-t border-slate-100 dark:border-transparent">
                    <form
                        onSubmit={e => {
                            e.preventDefault();
                            handleSend();
                        }}
                        className="flex gap-2"
                    >
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="Haz una pregunta..."
                            className="flex-1 bg-slate-100 dark:bg-slate-700/50 border-none rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-400 dark:text-white"
                            disabled={loading}
                        />
                        <button
                            type="submit"
                            disabled={loading || !input.trim()}
                            className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white p-3 rounded-full transition-all"
                        >
                            <span className="material-icons-round text-sm pointer-events-none">send</span>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};
