import React, { useEffect, useState } from 'react';

interface AssistantBubbleProps {
    grossWeight: number;
    noteWeight: number;
    product?: string;
    expirationDate?: string;
    productType?: string;
    temperatureSuggestion?: number;
    aiAlert?: string;
    tolerance?: number;
}

type BubbleStatus = 'match' | 'mismatch' | 'unknown';
type BubbleColor = 'emerald' | 'red' | 'zinc';

export const AssistantBubble: React.FC<AssistantBubbleProps> = ({
    grossWeight,
    noteWeight,
    product = 'Producto',
    expirationDate,
    productType,
    temperatureSuggestion,
    aiAlert,
    tolerance = 0.2,
}) => {
    const [status, setStatus] = useState<BubbleStatus>('unknown');
    const [color, setColor] = useState<BubbleColor>('zinc');
    const [netWeight, setNetWeight] = useState<number>(0);
    const [difference, setDifference] = useState<number>(0);

    useEffect(() => {
        if (grossWeight > 0 && noteWeight > 0) {
            const calculated = grossWeight - noteWeight;
            setNetWeight(calculated);
            const diff = Math.abs(calculated - noteWeight);
            setDifference(diff);

            if (diff <= tolerance) {
                setStatus('match');
                setColor('emerald');
            } else {
                setStatus('mismatch');
                setColor('red');
            }
        } else {
            setStatus('unknown');
            setColor('zinc');
        }
    }, [grossWeight, noteWeight, tolerance]);

    const getStatusIcon = () => {
        switch (status) {
            case 'match':
                return '✓';
            case 'mismatch':
                return '✕';
            default:
                return '○';
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'match':
                return 'Pesos Coinciden';
            case 'mismatch':
                return `Diferencia: ${difference.toFixed(2)}kg`;
            default:
                return 'Ingrese pesos';
        }
    };

    const colorClasses = {
        emerald: 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-100',
        red: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-100',
        zinc: 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300',
    };

    const iconColorClasses = {
        emerald: 'text-emerald-600 dark:text-emerald-400',
        red: 'text-red-600 dark:text-red-400',
        zinc: 'text-zinc-500 dark:text-zinc-400',
    };

    return (
        <div className={`card-rounded border-2 p-6 animate-fadeInScale transition-all duration-300 ${colorClasses[color]}`}>
            {/* Header: Status Icon + Product + Status Text */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className={`text-3xl font-bold ${iconColorClasses[color]}`}>
                        {getStatusIcon()}
                    </div>
                    <div>
                        <p className="text-sm font-semibold opacity-75">
                            {product}
                        </p>
                        <p className="text-lg font-bold">
                            {getStatusText()}
                        </p>
                    </div>
                </div>
            </div>

            {/* Peso Neto Display */}
            {netWeight > 0 && (
                <div className="mb-4 p-3 rounded-xl bg-white dark:bg-zinc-800 bg-opacity-50">
                    <p className="text-xs opacity-75 mb-1">Peso Neto Calculado</p>
                    <p className="text-2xl font-bold">
                        {netWeight.toFixed(2)} kg
                    </p>
                </div>
            )}

            {/* Alerts & Tips */}
            {(aiAlert || temperatureSuggestion || productType) && (
                <div className="space-y-2">
                    {aiAlert && (
                        <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-100 text-sm flex items-center gap-2">
                            <span>⚠️</span>
                            <span>{aiAlert}</span>
                        </div>
                    )}

                    {temperatureSuggestion !== undefined && (
                        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-100 text-sm flex items-center gap-2">
                            <span>❄️</span>
                            <span>Temp recomendada: {temperatureSuggestion}°C</span>
                        </div>
                    )}

                    {productType && (
                        <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-100 text-sm flex items-center gap-2">
                            <span>
                                {productType === 'congelado'
                                    ? '🧊'
                                    : productType === 'resfriado'
                                    ? '❄️'
                                    : '📦'}
                            </span>
                            <span className="capitalize">{productType}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Expiration Warning */}
            {expirationDate && (
                <div className="mt-4 pt-4 border-t border-current border-opacity-20">
                    <p className="text-xs opacity-75">Vencimiento</p>
                    <p className="font-semibold">{expirationDate}</p>
                </div>
            )}
        </div>
    );
};
