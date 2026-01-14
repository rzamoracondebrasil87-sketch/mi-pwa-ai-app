
import React, { useEffect, useState } from 'react';
import { InstallPromptEvent } from '../types';
import { useTranslation } from '../services/i18n';

type DeviceType = 'ios' | 'android' | 'desktop' | 'unknown';

interface InstallInstructions {
    title: string;
    description: string;
    steps: string[];
    buttonText: string;
    showShareBox: boolean;
}

export const InstallManager: React.FC = () => {
    const { t } = useTranslation();
    const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
    const [showInstallModal, setShowInstallModal] = useState(false);
    const [deviceType, setDeviceType] = useState<DeviceType>('unknown');

    // Detectar tipo de dispositivo
    const detectDevice = (): DeviceType => {
        const ua = navigator.userAgent;
        if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
        if (/Android/.test(ua)) return 'android';
        if (/Windows|Mac|Linux/.test(ua) && !/Android|iPhone|iPad/.test(ua)) return 'desktop';
        return 'unknown';
    };

    // Obtener instrucciones personalizadas por dispositivo
    const getInstallInstructions = (): InstallInstructions => {
        switch (deviceType) {
            case 'ios':
                return {
                    title: 'Instalar en iOS',
                    description: 'Acceso rápido desde tu pantalla de inicio',
                    steps: [
                        '1. Toca el ícono de Compartir en la barra inferior',
                        '2. Selecciona "Añadir a pantalla de inicio"',
                        '3. Personaliza el nombre y toca "Añadir"',
                        '¡Listo! Ahora tendrás acceso instantáneo'
                    ],
                    buttonText: 'Entendido',
                    showShareBox: true
                };
            case 'android':
                return {
                    title: 'Instalar en Android',
                    description: 'Acceso offline y sin publicidades',
                    steps: [
                        '1. Toca el menú (⋮) en la esquina superior',
                        '2. Selecciona "Instalar aplicación"',
                        '3. Confirma en el diálogo de instalación',
                        '¡Listo! La app se instalará en tu dispositivo'
                    ],
                    buttonText: 'Instalar',
                    showShareBox: false
                };
            case 'desktop':
                return {
                    title: 'Instalar Aplicación',
                    description: 'Acceso offline en tu computadora',
                    steps: [
                        '1. Haz clic en el ícono de descarga (⤓) en la barra de direcciones',
                        '2. Selecciona "Instalar"',
                        '3. La app aparecerá en tu escritorio y menú inicio',
                        '¡Listo! Úsala sin conexión'
                    ],
                    buttonText: 'Instalar',
                    showShareBox: false
                };
            default:
                return {
                    title: 'Instalar Conferente Pro',
                    description: 'Acceso rápido y offline',
                    steps: [
                        '1. Usa el navegador Safari (iOS) o Chrome (Android)',
                        '2. Busca el menú de opciones',
                        '3. Selecciona "Agregar a pantalla de inicio"'
                    ],
                    buttonText: 'Aceptar',
                    showShareBox: false
                };
        }
    };

    useEffect(() => {
        // Detect device type
        setDeviceType(detectDevice());

        // 1. Handle Install Prompt
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setInstallPrompt(e as InstallPromptEvent);
            
            // Auto-show modal if not installed
            if (!window.matchMedia('(display-mode: standalone)').matches) {
                setTimeout(() => setShowInstallModal(true), 2000); // Wait 2s before showing
            }
        };

        // 2. Detectar iOS (fallback manual)
        if (detectDevice() === 'ios' && !window.matchMedia('(display-mode: standalone)').matches) {
            setTimeout(() => setShowInstallModal(true), 2500);
        }

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }, []);

    const installApp = async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        if (outcome === 'accepted') {
            setShowInstallModal(false);
        }
    };

    return (
        <>
            {/* Install Modal */}
            {showInstallModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl transform transition-all animate-slide-up relative overflow-hidden">
                        
                        {/* Decorative Background Gradient */}
                        <div className={`absolute top-0 left-0 w-full h-32 rounded-b-[50%] -mt-16 ${
                            deviceType === 'ios' ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                            deviceType === 'android' ? 'bg-gradient-to-br from-green-500 to-green-600' :
                            'bg-gradient-to-br from-purple-500 to-purple-600'
                        }`}></div>

                        <div className="relative flex justify-center mb-6 mt-4">
                            <div className="bg-white dark:bg-slate-800 p-2 rounded-full shadow-xl">
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-inner text-white text-3xl ${
                                    deviceType === 'ios' ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                                    deviceType === 'android' ? 'bg-gradient-to-br from-green-500 to-green-600' :
                                    'bg-gradient-to-br from-purple-500 to-purple-600'
                                }`}>
                                    <span className="material-icons-round">{deviceType === 'ios' ? 'phone_iphone' : deviceType === 'android' ? 'android' : 'desktop_windows'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Get Device-Specific Instructions */}
                        {(() => {
                            const instructions = getInstallInstructions();
                            return (
                                <>
                                    <h3 className="text-2xl font-black text-center text-slate-800 dark:text-white mb-3 leading-tight">
                                        {instructions.title}
                                    </h3>
                                    <p className="text-slate-500 dark:text-slate-400 text-center text-sm leading-relaxed px-2 mb-6">
                                        {instructions.description}
                                    </p>

                                    {/* iOS Share Instructions Box */}
                                    {instructions.showShareBox && (
                                        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-2xl p-4 mb-6">
                                            <p className="text-xs font-bold text-blue-700 dark:text-blue-200 mb-3 uppercase tracking-wider">📲 Pasos rápidos:</p>
                                            <ol className="space-y-2">
                                                {instructions.steps.map((step, idx) => (
                                                    <li key={idx} className="text-xs text-blue-600 dark:text-blue-300 leading-relaxed">
                                                        {step}
                                                    </li>
                                                ))}
                                            </ol>
                                        </div>
                                    )}

                                    {!instructions.showShareBox && (
                                        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-2xl p-4 mb-6 space-y-2">
                                            {instructions.steps.map((step, idx) => (
                                                <p key={idx} className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                                    {step}
                                                </p>
                                            ))}
                                        </div>
                                    )}

                                    <div className="mt-8 flex flex-col gap-3">
                                        <button 
                                            onClick={() => {
                                                if (deviceType === 'android' && installPrompt) {
                                                    installApp();
                                                } else {
                                                    setShowInstallModal(false);
                                                }
                                            }}
                                            className={`w-full py-4 rounded-2xl font-black text-lg shadow-xl transition-all hover:scale-[1.02] active:scale-95 ${
                                                deviceType === 'ios' 
                                                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/30' :
                                                deviceType === 'android'
                                                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-600/30' :
                                                    'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-slate-900/20 dark:shadow-white/10'
                                            }`}
                                        >
                                            {instructions.buttonText}
                                        </button>
                                        <button 
                                            onClick={() => setShowInstallModal(false)}
                                            className="w-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 py-3 text-sm font-bold transition-colors"
                                        >
                                            {deviceType === 'ios' ? 'Instalar después' : t('btn_not_now')}
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}
        </>
    );
};
