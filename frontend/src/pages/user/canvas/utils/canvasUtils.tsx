// Canvas utility functions — extracted from CanvasPage.tsx
import React from 'react';
import {
  Activity, DollarSign, ShoppingCart, TrendingUp, Percent, Users, Box
} from 'lucide-react';
import type { CanvasWidget, CustomFilter } from '../types';
import { formatKpiValue } from '../../../../lib/api/canvas';
import { prettifyLabel } from '../../../../components/dashboard/dashboard-helpers';

/**
 * Computes display value, subtext, and extra detail pills for KPI cards.
 */
export const getDisplayKPI = (widget: CanvasWidget, customFilters: CustomFilter[] = []) => {
  let displayValue = widget.value ?? '';
  let displaySubtext = widget.subtext ?? '';
  let extraDetails: { label: string; value: string }[] = [];

  if (widget.data && widget.data.length > 0) {
    const firstRow = widget.data[0];
    const keys = Object.keys(firstRow);
    const numericKey = keys.find(k => k.toLowerCase() === 'value') || keys.find(k => typeof firstRow[k] === 'number');
    const labelKey = keys.find(k => k.toLowerCase() === 'label');

    // 1. Capture dimension label if present (e.g., California) and map to target dim name
    if (labelKey) {
      const labelVal = firstRow[labelKey];
      if (labelVal !== undefined && labelVal !== null) {
        const dimLabel = widget.targetDimName ? prettifyLabel(widget.targetDimName.split(',')[0]) : 'Top Entity';
        extraDetails.push({ label: dimLabel, value: String(labelVal) });
      }
    }

    // 2. Capture other non-technical metrics/dimensions
    keys.forEach(k => {
      const kLower = k.toLowerCase();
      const isTechnical = ['key', 'is percentage', 'format type', 'ispercentage', 'formattype', 'dtype', 'type', 'color', 'id'].includes(kLower);
      
      if (k !== numericKey && kLower !== 'value' && kLower !== 'label' && !isTechnical) {
        const val = firstRow[k];
        if (val !== undefined && val !== null) {
          const formattedVal = typeof val === 'number' 
            ? formatKpiValue(val, k, undefined, widget.numberFormat)
            : String(val);
          const displayLabel = k.replace(/[_\-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          extraDetails.push({ label: displayLabel, value: formattedVal });
        }
      }
    });
  }

  const activeFilters = customFilters.filter(f => f.selectedValue !== null);
  if (activeFilters.length > 0) {
    const filterDesc = activeFilters.map(f => `${f.fieldName}=${f.selectedValue}`).join(', ');
    displaySubtext = `${widget.subtext || ''} (Filtered by: ${filterDesc})`;
  }

  return { value: displayValue, subtext: displaySubtext, extraDetails };
};

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
