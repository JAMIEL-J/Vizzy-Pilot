// Canvas utility functions — extracted from CanvasPage.tsx
import React from 'react';
import {
  Activity, DollarSign, ShoppingCart, TrendingUp, Percent, Users, Box
} from 'lucide-react';

/**
 * Returns a styled KPI icon based on metric name keyword matching.
 */
export const getKpiIcon = (metricName: string, color: string) => {
  const lower = String(metricName).toLowerCase();
  let Icon = Activity;
  if (lower.includes('sale') || lower.includes('revenue') || lower.includes('profit') || lower.includes('cost') || lower.includes('price') || lower.includes('amount')) {
    Icon = DollarSign;
  } else if (lower.includes('order') || lower.includes('transaction') || lower.includes('deal') || lower.includes('count')) {
    Icon = ShoppingCart;
  } else if (lower.includes('rate') || lower.includes('margin') || lower.includes('pct') || lower.includes('growth')) {
    Icon = TrendingUp;
  } else if (lower.includes('percent')) {
    Icon = Percent;
  } else if (lower.includes('user') || lower.includes('customer') || lower.includes('client') || lower.includes('visitor')) {
    Icon = Users;
  } else if (lower.includes('product') || lower.includes('item') || lower.includes('stock')) {
    Icon = Box;
  }

  return (
    <div 
      className="p-2 rounded-lg border flex items-center justify-center shrink-0 shadow-md relative overflow-hidden group-hover/kpi:scale-105 transition-transform duration-300"
      style={{ backgroundColor: `${color}12`, borderColor: `${color}25` }}
    >
      <div 
        className="absolute inset-0 blur-md opacity-25"
        style={{ backgroundColor: color }}
      />
      <Icon className="w-4 h-4 relative z-10" style={{ color }} />
    </div>
  );
};

/**
 * Strip underscores and apply Title Case.
 */
export const humanizeLabel = (str: string): string => {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

/**
 * Beautify raw chart titles: strip underscores, Title Case, collapse whitespace.
 */
export const beautifyTitle = (rawTitle: string): string => {
  if (!rawTitle) return '';
  return rawTitle
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Sanitize internal boolean, integer, or raw values for clean presentation.
 * Converts 0/1 to No/Yes, formats dates, humanizes snake_case.
 */
export const sanitizeLabel = (val: any): string => {
  if (val === null || val === undefined) return '—';
  const str = String(val).trim();
  const lower = str.toLowerCase();
  
  if (lower === '1' || lower === 'true' || lower === 'yes' || lower === 'y') {
    return 'Yes';
  }
  if (lower === '0' || lower === 'false' || lower === 'no' || lower === 'n') {
    return 'No';
  }

  // Time grain formatting (e.g. 2014-06-15 -> Jun 15, 2014)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {}
  }
  
  // 2014-06 -> June 2014
  if (/^\d{4}-\d{2}$/.test(str)) {
    try {
      const d = new Date(str + "-01");
      if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch (e) {}
  }

  // 2014-Q1 -> Q1 2014
  if (/^\d{4}-Q[1-4]$/i.test(str)) {
    const parts = str.split('-');
    return `${parts[1].toUpperCase()} ${parts[0]}`;
  }
  
  // Humanize standard text if it looks like a database snake case name
  if (str.includes('_')) {
    return humanizeLabel(str);
  }
  return str;
};
