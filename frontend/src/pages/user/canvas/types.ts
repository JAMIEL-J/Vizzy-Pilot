// Canvas shared type definitions — extracted from CanvasPage.tsx
import type { NumberFormatConfig } from '../../../lib/api/canvas';
import type { ChartDataPoint, CanvasChartType, AggregationType, TimeGrain } from '../../../types/canvas';

// Re-export for convenience
export type { ChartDataPoint, CanvasChartType, AggregationType, TimeGrain, NumberFormatConfig };

export interface CanvasWidget {
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

export interface CustomFilter {
  fieldName: string;
  category: string;
  options: string[];
  selectedValue: string | null;
}

export interface HistoryFrame {
  widgets: CanvasWidget[];
  fieldsList: FieldDef[];
  checkedFields: string[];
}

export interface FieldDef {
  name: string;
  category: string;
  type: string;
  formula?: string;
}
