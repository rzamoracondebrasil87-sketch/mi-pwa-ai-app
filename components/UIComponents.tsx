import React from 'react';

interface InfoCardProps {
    icon: string;
    title: string;
    value: string | number;
    status?: 'success' | 'warning' | 'error' | 'info';
    description?: string;
    action?: {
        label: string;
        onClick: () => void;
    };
}

export const InfoCard: React.FC<InfoCardProps> = ({
    icon,
    title,
    value,
    status = 'info',
    description,
    action,
}) => {
    const statusStyles = {
        success: 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-200',
        warning: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-200',
        error: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-200',
        info: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-200',
    };

    const statusIconColor = {
        success: 'text-emerald-600 dark:text-emerald-400',
        warning: 'text-amber-600 dark:text-amber-400',
        error: 'text-red-600 dark:text-red-400',
        info: 'text-blue-600 dark:text-blue-400',
    };

    return (
        <div className={`rounded-2xl border p-4 transition-all hover:shadow-md ${statusStyles[status]}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                    <span className={`material-icons-round text-2xl shrink-0 ${statusIconColor[status]}`}>
                        {icon}
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider opacity-75 mb-1">
                            {title}
                        </p>
                        <p className="text-2xl font-black truncate">{value}</p>
                        {description && (
                            <p className="text-xs opacity-75 mt-2 line-clamp-2">{description}</p>
                        )}
                    </div>
                </div>
                {action && (
                    <button
                        onClick={action.onClick}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-current/20 hover:bg-current/30 transition-all whitespace-nowrap"
                    >
                        {action.label}
                    </button>
                )}
            </div>
        </div>
    );
};

/**
 * Grid de información con múltiples cards
 */
interface InfoGridProps {
    cards: InfoCardProps[];
    columns?: 1 | 2 | 3;
}

export const InfoGrid: React.FC<InfoGridProps> = ({ cards, columns = 2 }) => {
    const gridClass = {
        1: 'grid-cols-1',
        2: 'grid-cols-1 sm:grid-cols-2',
        3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    }[columns];

    return (
        <div className={`grid ${gridClass} gap-3`}>
            {cards.map((card, idx) => (
                <InfoCard key={idx} {...card} />
            ))}
        </div>
    );
};

/**
 * Alert/Notification Banner
 */
interface AlertBannerProps {
    message: string;
    type?: 'success' | 'warning' | 'error' | 'info';
    dismissible?: boolean;
    onDismiss?: () => void;
    action?: {
        label: string;
        onClick: () => void;
    };
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
    message,
    type = 'info',
    dismissible = true,
    onDismiss,
    action,
}) => {
    const [isDismissed, setIsDismissed] = React.useState(false);

    if (isDismissed) return null;

    const styles = {
        success: 'bg-emerald-100 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200',
        warning: 'bg-amber-100 dark:bg-amber-950 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200',
        error: 'bg-red-100 dark:bg-red-950 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200',
        info: 'bg-blue-100 dark:bg-blue-950 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-200',
    };

    const icons = {
        success: 'check_circle',
        warning: 'warning',
        error: 'error',
        info: 'info',
    };

    return (
        <div className={`rounded-xl border p-4 flex items-center gap-3 animate-slideUp ${styles[type]}`}>
            <span className="material-icons-round shrink-0">{icons[type]}</span>
            <p className="flex-1 text-sm font-medium">{message}</p>
            {action && (
                <button
                    onClick={action.onClick}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-current/20 hover:bg-current/30 transition-all whitespace-nowrap"
                >
                    {action.label}
                </button>
            )}
            {dismissible && (
                <button
                    onClick={() => {
                        setIsDismissed(true);
                        onDismiss?.();
                    }}
                    className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
                >
                    <span className="material-icons-round text-lg">close</span>
                </button>
            )}
        </div>
    );
};

/**
 * Badge con icono y estado
 */
interface BadgeProps {
    label: string;
    icon?: string;
    status?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
    size?: 'sm' | 'md' | 'lg';
}

export const Badge: React.FC<BadgeProps> = ({ label, icon, status = 'neutral', size = 'md' }) => {
    const statusStyles = {
        success: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200',
        warning: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-200',
        error: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-200',
        info: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-200',
        neutral: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200',
    };

    const sizeStyles = {
        sm: 'px-2 py-1 text-xs',
        md: 'px-3 py-1.5 text-sm',
        lg: 'px-4 py-2 text-base',
    };

    return (
        <div className={`inline-flex items-center gap-2 rounded-full font-semibold transition-all ${statusStyles[status]} ${sizeStyles[size]}`}>
            {icon && <span className="material-icons-round text-sm">{icon}</span>}
            {label}
        </div>
    );
};

/**
 * Progress Bar
 */
interface ProgressBarProps {
    value: number; // 0-100
    label?: string;
    showLabel?: boolean;
    color?: 'blue' | 'green' | 'red' | 'amber';
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
    value,
    label,
    showLabel = true,
    color = 'blue',
}) => {
    const colorStyles = {
        blue: 'bg-blue-500',
        green: 'bg-emerald-500',
        red: 'bg-red-500',
        amber: 'bg-amber-500',
    };

    const clampedValue = Math.max(0, Math.min(100, value));

    return (
        <div className="space-y-1">
            {(label || showLabel) && (
                <div className="flex justify-between items-center text-xs font-semibold">
                    <span>{label || 'Progreso'}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">{clampedValue}%</span>
                </div>
            )}
            <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                <div
                    className={`h-full ${colorStyles[color]} rounded-full transition-all duration-300`}
                    style={{ width: `${clampedValue}%` }}
                ></div>
            </div>
        </div>
    );
};

/**
 * Stat Counter animado
 */
interface StatCounterProps {
    label: string;
    value: number;
    unit?: string;
    trend?: 'up' | 'down' | 'neutral';
}

export const StatCounter: React.FC<StatCounterProps> = ({ label, value, unit, trend = 'neutral' }) => {
    const trendColors = {
        up: 'text-emerald-600 dark:text-emerald-400',
        down: 'text-red-600 dark:text-red-400',
        neutral: 'text-zinc-400',
    };

    const trendIcons = {
        up: 'trending_up',
        down: 'trending_down',
        neutral: 'remove',
    };

    return (
        <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                {label}
            </p>
            <p className="text-3xl font-black text-zinc-900 dark:text-white">
                {value}
                {unit && <span className="text-lg opacity-60 ml-1">{unit}</span>}
            </p>
            {trend !== 'neutral' && (
                <p className={`text-xs font-semibold mt-1 flex items-center justify-center gap-1 ${trendColors[trend]}`}>
                    <span className="material-icons-round text-sm">{trendIcons[trend]}</span>
                    {trend === 'up' ? 'Aumentando' : 'Disminuyendo'}
                </p>
            )}
        </div>
    );
};
