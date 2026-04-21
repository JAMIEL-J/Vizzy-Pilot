import React from 'react';

interface KPICardProps {
    value: string | number;
    label: string;
    change?: number;
    prefix?: string;
    suffix?: string;
    trendLabel?: string;
    variant?: 'default' | 'minimal';
    compact?: boolean;
    metrics?: Array<{ label: string; value: string | number }>;
}

export const KPICard: React.FC<KPICardProps> = ({
    value,
    label,
    change,
    prefix = '',
    suffix = '',
    trendLabel = 'vs last period',
    variant = 'default',
    compact: _compact = false,
    metrics,
}) => {
    const lowerLabel = String(label || '').toLowerCase();
    const lowerSuffix = String(suffix || '').toLowerCase();
    const useWholeNumber = ['age', 'tenure', 'duration', 'day', 'days', 'month', 'months', 'year', 'years', 'los', 'length of stay', 'lengthofstay']
        .some((kw) => lowerLabel.includes(kw) || lowerSuffix.includes(kw));

    // Format value if it's a number
    const formattedValue = typeof value === 'number'
        ? new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: useWholeNumber ? 0 : 2
        }).format(useWholeNumber ? Math.round(value) : value)
        : value;

    const containerClasses = variant === 'default'
        ? "bg-surface-container-lowest dark:bg-surface-container/80 dark:backdrop-blur-md rounded-xl p-6 border border-transparent dark:border-white/5 shadow-sm dark:shadow-none min-w-[200px] flex flex-col justify-between h-full relative overflow-hidden group transition-all duration-300"
        : "flex flex-col justify-between h-full relative overflow-hidden group"; // Minimal: no border/shadow/bg/padding (handled by parent)

    return (
        <div className={containerClasses}>
            <div className="relative z-10">
                <div className="text-[13px] text-gray-600 dark:text-gray-400 font-serif tracking-wide mb-2">
                    {label}
                </div>
                {Array.isArray(metrics) && metrics.length > 0 ? (
                    <div className="space-y-2 mt-2">
                        {metrics.map((metric) => (
                            <div
                                key={metric.label}
                                className="flex items-center justify-between gap-4 py-1 border-b border-border-main/40 last:border-b-0"
                            >
                                <span className="text-base font-semibold font-serif text-gray-900 dark:text-white">
                                    {metric.label}
                                </span>
                                <span className="text-2xl font-serif tracking-tight text-gray-900 dark:text-white group-hover:text-primary transition-colors drop-shadow-md">
                                    {metric.value}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-3xl font-serif tracking-tighter text-gray-900 dark:text-white group-hover:text-primary transition-colors drop-shadow-md">
                        {prefix}{formattedValue}{suffix}
                    </div>
                )}
            </div>
            {change !== undefined && (
                <div className={`relative z-10 text-[12px] font-serif tracking-wide mt-4 flex items-center w-fit px-2 py-1.5 rounded-sm border ${change >= 0 ? 'text-primary bg-primary/10 border-primary/20' : 'text-red-500 bg-red-500/10 border-red-500/20'}`}>
                    <span className="mr-1">{change >= 0 ? '↑' : '↓'}</span>
                    {Math.abs(change)}% <span className="text-gray-500 ml-1.5 opacity-60 font-normal">{trendLabel}</span>
                </div>
            )}
        </div>
    );
};
