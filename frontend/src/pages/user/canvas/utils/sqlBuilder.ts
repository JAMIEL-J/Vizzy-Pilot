// SQL building utilities — extracted from CanvasPage.tsx
import { formatKpiValue } from '../../../../lib/api/canvas';
import type { CanvasWidget, FieldDef } from '../types';
import { WIDGET_COLORS } from '../constants';

/**
 * Build a DuckDB aggregation expression for a given column.
 * Handles AI calculated fields (formulas), dirty numeric string columns, and PERCENT_CHANGE windows.
 */
export const buildAggExpr = (agg: string, colName: string, fieldsList: FieldDef[], orderExpr?: string): string => {
  const colObj = fieldsList.find(f => f.name === colName);
  
  let baseAgg = agg === 'PERCENT_CHANGE' ? 'SUM' : agg;
  if ((agg === 'SUM' || agg === 'PERCENT_CHANGE') && colObj?.defaultAgg) {
    baseAgg = colObj.defaultAgg;
  }
  let baseExpr = `${baseAgg}("${colName}")`;

  // 1. Handle AI Calculated Fields with formulas
  if (colObj?.formula) {
    if (/\b(SUM|AVG|MIN|MAX|COUNT|VAR_SAMP)\s*\(/i.test(colObj.formula)) {
      baseExpr = `(${colObj.formula})`;
    } else {
      baseExpr = `${baseAgg}(${colObj.formula})`;
    }
  }
  // 2. Handle dirty numeric string columns ONLY when column is a VARCHAR/string type
  else if (
    baseAgg !== 'COUNT' && colObj && (
      colObj.type.toLowerCase().includes('varchar') || 
      colObj.type.toLowerCase().includes('string') || 
      colObj.type.toLowerCase().includes('char') ||
      colObj.type.toLowerCase().includes('text')
    )
  ) {
    baseExpr = `${baseAgg}(TRY_CAST(NULLIF(REGEXP_REPLACE("${colName}", '^\\s*$', ''), '') AS DOUBLE))`;
  }

  if (agg === 'PERCENT_CHANGE') {
    const overClause = orderExpr ? `OVER (ORDER BY ${orderExpr} ASC)` : `OVER ()`;
    return `(((${baseExpr}) - LAG(${baseExpr}) ${overClause}) / NULLIF(LAG(${baseExpr}) ${overClause}, 0)) * 100`;
  }

  return baseExpr;
};

/**
 * Check if a column is a date/timestamp type.
 */
export const isDateColumn = (colName: string, fieldsList: FieldDef[]): boolean => {
  const colObj = fieldsList.find(f => f.name === colName);
  if (!colObj) return false;
  const typeLower = colObj.type.toLowerCase();
  const nameLower = colObj.name.toLowerCase();
  return colObj.category === 'Dates' || 
         typeLower.includes('date') || 
         typeLower.includes('timestamp') || 
         typeLower.includes('time') || 
         nameLower.includes('date') || 
         nameLower.includes('time');
};

/**
 * Get the SQL column expression, using formula if it's a calculated field.
 */
export const getColExpr = (colName: string, fieldsList: FieldDef[]): string => {
  const colObj = fieldsList.find(f => f.name === colName);
  if (colObj?.formula) return `(${colObj.formula})`;
  return `"${colName}"`;
};

/**
 * Transform a backend chart spec to a CanvasWidget shape.
 */
export const chartSpecToCanvasWidget = (
  spec: any, 
  query: string, 
  sql: string, 
  thinking: string[], 
  resultSummary: string
): CanvasWidget => {
  const chart = (spec && spec.chart) ? spec.chart : (spec || {});
  const type = chart.type === 'stacked_bar' || chart.type === 'stacked' ? 'stacked_bar' : (chart.type || 'table');
  
  let data: any[] = [];
  let value: string | undefined = undefined;
  let subtext: string | undefined = undefined;
  let xAxisKey: string | undefined = undefined;
  let yAxisKey: string | undefined = undefined;

  if (type === 'kpi') {
    const kpiVal = chart.data?.value;
    const kpiLabel = chart.data?.label || chart.title || '';
    const suffix = chart.data?.suffix || '';
    const rows = chart.data?.rows || [];
    
    const formattedMetricVal = suffix === '%'
      ? (typeof kpiVal === 'number' ? `${kpiVal.toFixed(1)}%` : String(kpiVal || '0') + '%')
      : formatKpiValue(kpiVal, kpiLabel, 'SUM');

    if (rows.length > 0) {
      data = rows;
      value = formattedMetricVal;
      subtext = kpiLabel || 'Total';
    } else {
      value = formattedMetricVal;
      subtext = kpiLabel || 'Total';
      if (chart.data?.metrics && chart.data.metrics.length > 1) {
        data = chart.data.metrics;
      }
    }
  } else if (type === 'bar' || type === 'stacked_bar') {
    data = chart.data?.rows || [];
    xAxisKey = chart.dimension || 'label';
    yAxisKey = chart.metric || (chart.data?.categories ? chart.data.categories[0] : 'value');
  } else if (type === 'line') {
    xAxisKey = chart.dimension || 'timestamp';
    yAxisKey = chart.metric || 'value';
    const series = chart.data?.series || [];
    if (series.length > 0) {
      data = series.map((s: any) => ({
        [xAxisKey!]: s.timestamp,
        [yAxisKey!]: s.value
      }));
    } else {
      data = chart.data?.rows || [];
    }
  } else if (type === 'pie') {
    data = chart.data?.rows || [];
    xAxisKey = chart.dimension || 'name';
    yAxisKey = chart.metric || 'val';
    if (data.length > 0 && !data[0].hasOwnProperty(xAxisKey)) {
      const keys = Object.keys(data[0]);
      xAxisKey = keys[0];
      yAxisKey = keys[1];
    }
  } else {
    data = chart.data?.rows || [];
  }

  const color = WIDGET_COLORS[Math.floor(Math.random() * WIDGET_COLORS.length)];

  const titleText = String(chart.title || '').toLowerCase();
  const topMatch = titleText.match(/\btop\s*(\d+)\b/);
  const limitVal = topMatch ? parseInt(topMatch[1]) : (data && data.length > 0 ? data.length : undefined);

  return {
    id: 'w-' + Date.now(),
    title: chart.title || 'AI Visual',
    type: type as any,
    data,
    width: type === 'kpi' ? 'third' : 'half',
    value,
    subtext,
    color,
    xAxisKey,
    yAxisKey,
    sql: sql,
    thinking: thinking,
    resultSummary: resultSummary,
    position: { x: 32, y: 152 },
    targetMetricName: chart.metric || '',
    targetDimName: chart.dimension || '',
    limit: limitVal
  };
};
