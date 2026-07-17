/**
 * Canvas Chart Data Types
 *
 * Typed interfaces for each chart data shape used by CanvasWidget.
 * Enables type narrowing via widget.type at each rendering branch.
 */

import type { NumberFormatConfig } from '../lib/api/canvas';

// ── Per-chart data point shapes ──────────────────────────────────────────

export interface BarDataPoint {
  label: string;
  value: number;
  /** Additional metric columns for grouped/stacked bars */
  [metricKey: string]: string | number;
}

export interface LineDataPoint {
  [key: string]: string | number;
}

export interface PieDataPoint {
  name: string;
  val: number;
}

export interface KpiDataPoint {
  [key: string]: string | number;
}

export interface TableDataPoint {
  [column: string]: string | number | boolean | null;
}

export interface ScatterDataPoint {
  x: number;
  y: number;
  label?: string;
  size?: number;
}

export interface MapDataPoint {
  region: string;
  value: number;
  [key: string]: string | number;
}

export interface ComboDataPoint {
  label: string;
  [key: string]: string | number;
}

// ── Base structure with index signature to avoid TS7053 index errors ──────

export interface ChartDataPoint {
  [key: string]: any;
}

// ── Chart type literal union ─────────────────────────────────────────────

export type CanvasChartType =
  | 'kpi'
  | 'bar'
  | 'stacked_bar'
  | 'line'
  | 'pie'
  | 'donut'
  | 'table'
  | 'map'
  | 'scatter'
  | 'bubble'
  | 'combo'
  | 'hbar';

// ── Aggregation type ─────────────────────────────────────────────────────

export type AggregationType =
  | 'SUM'
  | 'AVG'
  | 'MIN'
  | 'MAX'
  | 'COUNT'
  | 'VAR_SAMP'
  | 'PERCENT_CHANGE';

// ── Time grain type ──────────────────────────────────────────────────────

export type TimeGrain = 'year' | 'quarter' | 'month' | 'day';

// ── Main widget interface ────────────────────────────────────────────────

export interface CanvasWidgetTyped {
  id: string;
  title: string;
  type: CanvasChartType;
  data: ChartDataPoint[];
  width: 'full' | 'half' | 'third';
  value?: string;
  subtext?: string;
  color?: string;
  xAxisKey?: string;
  yAxisKey?: string;
  sql?: string;
  thinking?: string[];
  resultSummary?: string;
  position?: { x: number; y: number };
  customWidth?: number;
  customHeight?: number;
  activeGrain?: TimeGrain;
  activeAgg?: AggregationType;
  targetMetricName?: string;
  targetDimName?: string;
  filterOmitted?: boolean;
  numberFormat?: NumberFormatConfig;
  limit?: number;
  isConfigWarning?: boolean;
  configWarningMessage?: string;
}

// ── Dashboard config shape (replaces `any` in SavedDashboard.config) ────

export interface DashboardConfig {
  type: 'canvas';
  widgets: CanvasWidgetTyped[];
  gridSnap: boolean;
  showGridlines: boolean;
  selectedDatasetId?: string;
  selectedVersionId?: string;
}

// ── Chat output_data shape ───────────────────────────────────────────────

export interface ChatOutputData {
  type?: string;
  response_type?: string;
  chart?: {
    type: CanvasChartType;
    title: string;
    data: {
      rows?: ChartDataPoint[];
      columns?: string[];
      series?: { timestamp: string; value: number }[];
      value?: number;
      label?: string;
      suffix?: string;
      metrics?: KpiDataPoint[];
      categories?: string[];
      [key: string]: any;
    };
    dimension?: string;
    metric?: string;
  };
  data?: any;
  title?: string;
  sql?: string;
  thinking?: string[];
  resultSummary?: string;
  suggestions?: string[];
  diagnostic_sql_queries?: any[];
  diagnostics?: any[];
  explanation?: {
    key_insight?: string;
    detailed?: string;
    summary?: string;
    [key: string]: any;
  };
  original_query?: string;
  thought_process?: any[];
  followup_suggestions?: string[];
  ambiguity?: any;
  confidence?: number;
  currency?: string;
  [key: string]: any;
}
