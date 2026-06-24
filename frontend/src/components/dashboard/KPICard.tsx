import React from 'react';
import { Pill } from '@/components/ui/primitive';
import Sparkline from './Sparkline';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const KPICard = ({ 
  title, 
  value, 
  trend, 
  trend_label, 
  subtitle, 
  cardColor, 
  history 
}: { 
  title: string; 
  value: string; 
  trend?: number; 
  trend_label?: string; 
  subtitle?: string; 
  cardColor?: string; 
  history?: number[] 
}) => {

  // Compact KPI values by magnitude so cards stay readable on any dataset.
  const formatCompactValue = (valStr: string) => {
    if (!valStr) return '';

    const trimmed = String(valStr).trim();
    if (!trimmed) return '';

    // Preserve already-labeled values such as percentages or preformatted strings.
    if (/[a-zA-Z%]$/.test(trimmed)) return trimmed;

    const isCurrency = trimmed.includes('$');
    const rawNum = parseFloat(trimmed.replace(/[^0-9.-]+/g, ''));
    if (Number.isNaN(rawNum)) return trimmed;

    const absValue = Math.abs(rawNum);
    const sign = rawNum < 0 ? '-' : '';

    const compact = (value: number, divisor: number, suffix: string) => {
      const scaled = value / divisor;
      const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
      const body = String(Number(scaled.toFixed(decimals)));
      return `${sign}${isCurrency ? '$' : ''}${body}${suffix}`;
    };

    if (absValue >= 1_000_000_000_000) return compact(absValue, 1_000_000_000_000, 'T');
    if (absValue >= 1_000_000_000) return compact(absValue, 1_000_000_000, 'B');
    if (absValue >= 1_000_000) return compact(absValue, 1_000_000, 'M');
    if (absValue >= 1_000) return compact(absValue, 1_000, 'K');

    return isCurrency
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(rawNum)
      : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(rawNum);
  };

  const finalValue = formatCompactValue(String(value ?? ''));

  // Dynamic Font Sizing for long numbers
  const valueSizeClass = finalValue.length >= 10
    ? 'text-lg sm:text-2xl text-themed-main font-bold'
    : 'text-2xl sm:text-3xl md:text-4xl text-themed-main font-bold';

  // Trend logic
  const isPositive = trend !== undefined && trend > 0;
  const isNegative = trend !== undefined && trend < 0;
  
  const trendText = trend !== undefined ? `${Math.abs(trend)}%` : '';
  const trendCaption = trend_label || subtitle || (trend !== undefined ? 'vs last month' : '');
  const trendTone = isPositive ? 'success' : isNegative ? 'danger' : 'default';

  const safeCardColor = cardColor || '#16231b';

  return (
    <div className="relative overflow-hidden p-5 transition bg-bg-card border border-border-main rounded-2xl shadow-sm hover:shadow-md">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: safeCardColor }} />
      
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-themed-muted">
          {title}
        </span>
        {trend !== undefined && (
          <Pill tone={trendTone} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold">
            {isPositive ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : isNegative ? (
              <TrendingDown className="h-3.5 w-3.5" />
            ) : (
              <Minus className="h-3.5 w-3.5" />
            )}
            <span>{trendText || '0%'}</span>
          </Pill>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className={`font-sans tracking-tight leading-none ${valueSizeClass}`}>{finalValue}</span>
          {trendCaption && (
            <span className="text-[10px] text-themed-muted mt-1.5 block font-sans">
              {trendCaption}
            </span>
          )}
        </div>
        
        {history && history.length > 0 && (
          <div className="opacity-80 hover:opacity-100 transition-opacity">
            <Sparkline data={history} color={safeCardColor} />
          </div>
        )}
      </div>
    </div>
  );
};

export default KPICard;
