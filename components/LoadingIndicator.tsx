import React from 'react';

interface LoadingIndicatorProps {
    isLoading: boolean;
    message?: string;
    type?: 'spinner' | 'skeleton' | 'pulse';
    fullScreen?: boolean;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
    isLoading,
    message = 'Analizando...',
    type = 'spinner',
    fullScreen = false,
}) => {
    if (!isLoading) return null;

    const containerClass = fullScreen
        ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md'
        : 'flex items-center justify-center gap-3 p-4';

    return (
        <div className={containerClass}>
            <div className="flex flex-col items-center gap-3">
                {type === 'spinner' && (
                    <div className="relative w-12 h-12">
                        {/* Outer ring */}
                        <div className="absolute inset-0 rounded-full border-4 border-zinc-200 dark:border-zinc-700"></div>
                        {/* Spinning ring */}
                        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 border-r-blue-500 animate-spin"></div>
                    </div>
                )}

                {type === 'skeleton' && (
                    <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                            <div
                                key={i}
                                className="w-3 h-3 rounded-full bg-blue-500 animate-bounce"
                                style={{
                                    animationDelay: `${i * 0.15}s`,
                                }}
                            ></div>
                        ))}
                    </div>
                )}

                {type === 'pulse' && (
                    <div className="w-12 h-12 rounded-full bg-blue-500 animate-pulse"></div>
                )}

                {message && (
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 text-center">
                        {message}
                    </p>
                )}
            </div>
        </div>
    );
};

/**
 * Skeleton Loader para cards de historial
 */
export const HistorySkeleton: React.FC = () => {
    return (
        <div className="space-y-3 p-4">
            {[1, 2, 3].map((i) => (
                <div
                    key={i}
                    className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-4 animate-pulse"
                >
                    <div className="flex gap-3">
                        <div className="w-12 h-12 rounded-full bg-zinc-300 dark:bg-zinc-700"></div>
                        <div className="flex-1 space-y-2">
                            <div className="h-4 bg-zinc-300 dark:bg-zinc-700 rounded w-3/4"></div>
                            <div className="h-3 bg-zinc-300 dark:bg-zinc-700 rounded w-1/2"></div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

/**
 * Skeleton para imagen/foto
 */
export const ImageSkeleton: React.FC<{ className?: string }> = ({ className = 'w-full h-64' }) => {
    return (
        <div className={`${className} rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse`}></div>
    );
};

/**
 * Tooltip Component
 */
interface TooltipProps {
    text: string;
    children: React.ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children, position = 'top' }) => {
    const [isVisible, setIsVisible] = React.useState(false);

    const positionClass = {
        top: 'bottom-full mb-2',
        bottom: 'top-full mt-2',
        left: 'right-full mr-2',
        right: 'left-full ml-2',
    }[position];

    return (
        <div className="relative inline-block group">
            {children}
            {isVisible && (
                <div
                    className={`absolute ${positionClass} left-1/2 -translate-x-1/2 z-50 
                    px-3 py-2 bg-zinc-900 dark:bg-zinc-700 text-white text-xs rounded-lg
                    whitespace-nowrap animate-fadeInScale pointer-events-none`}
                >
                    {text}
                </div>
            )}
            <button
                onMouseEnter={() => setIsVisible(true)}
                onMouseLeave={() => setIsVisible(false)}
                className="ml-1 inline"
            >
                <span className="text-xs text-blue-500 cursor-help">ℹ️</span>
            </button>
        </div>
    );
};

/**
 * Help Modal
 */
interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    content: string;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, title, content }) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-zinc-800 rounded-3xl p-8 max-w-md mx-4 shadow-2xl animate-slideUp"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-4">{title}</h2>
                <p className="text-zinc-600 dark:text-zinc-300 mb-6 leading-relaxed">{content}</p>
                <button
                    onClick={onClose}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-2xl transition-all hover:scale-[1.02] active:scale-95"
                >
                    Entendido
                </button>
            </div>
        </div>
    );
};
