import { apiClient } from './client';

// =============================================================================
// Canvas API Types
// =============================================================================

export interface CanvasColumn {
    name: string;
    dtype: string;
    category: 'Metrics' | 'Dimensions' | 'Dates';
}

export interface CanvasSchemaResponse {
    dataset_id: string;
    version_id: string;
    dataset_name: string;
    columns: CanvasColumn[];
    row_count: number | null;
}

export interface CanvasSqlResult {
    sql: string;
    results: Record<string, any>[];
    columns: string[];
    row_count: number;
    truncated: boolean;
    execution_time_ms: number;
    error: string | null;
    filter_omitted?: boolean;
}

// =============================================================================
// Canvas API Service
// =============================================================================

export const canvasService = {
    // Get lightweight column schema
    getSchema: async (datasetId: string) => {
        const response = await apiClient.get<CanvasSchemaResponse>(`/datasets/${datasetId}/canvas/schema`);
        return response.data;
    },

    // Execute sandboxed SQL on Canvas dataset
    executeSql: async (datasetId: string, versionId: string, sql: string, filters?: any[]) => {
        const response = await apiClient.post<CanvasSqlResult>(`/datasets/${datasetId}/canvas/sql/execute`, {
            sql,
            max_rows: 500,  // Prevent massive table rendering
            timeout_seconds: 30,
            filters: filters || null
        });
        return response.data;
    },

    /**
     * Create and validate a calculated field from a user prompt.
     */
    createCalculatedField: async (
        datasetId: string,
        prompt: string
    ): Promise<{
        success: boolean;
        field_name: string;
        formula_sql: string;
        category: string;
        dtype: string;
        schema: CanvasSchemaResponse;
    }> => {
        const response = await apiClient.post<{
            success: boolean;
            field_name: string;
            formula_sql: string;
            category: string;
            dtype: string;
            schema: CanvasSchemaResponse;
        }>(`/datasets/${datasetId}/canvas/calculate-field`, { prompt });
        return response.data;
    },
};

// =============================================================================
// KPI Formatting Utilities
// =============================================================================

/**
 * Auto-detect if a metric label suggests currency values.
 */
function isCurrencyMetric(label: string): boolean {
    const keywords = [
        'revenue', 'sales', 'profit', 'cost', 'price', 'amount',
        'income', 'expense', 'budget', 'spend', 'earning',
        'total_revenue', 'total_sales', 'gross', 'net',
        'ltv', 'cac', 'arpu'
    ];
    const lower = label.toLowerCase().replace(/[_\-]/g, ' ');
    return keywords.some(k => lower.includes(k));
}

/**
 * Auto-detect if a metric label suggests percentage values.
 */
function isPercentageMetric(label: string): boolean {
    const keywords = [
        'rate', 'ratio', 'percent', 'pct', 'margin', 'churn',
        'conversion', 'retention', 'bounce', 'growth', 'discount',
        'yield', 'share'
    ];
    const lower = label.toLowerCase().replace(/[_\-]/g, ' ');
    if (lower.includes('count')) return false; // Prevent fields like 'ChurnCount' from triggering percentage rules
    return keywords.some(k => lower.includes(k));
}

/**
 * Format a numeric KPI value with professional compact notation.
 * 
 * Examples:
 *   formatKpiValue(2345678, 'Sales')        → '$2.3M'
 *   formatKpiValue(45200, 'Quantity')        → '45.2K'
 *   formatKpiValue(0.156, 'Churn Rate')      → '15.6%'
 *   formatKpiValue(1234567890, 'Revenue')    → '$1.2B'
 *   formatKpiValue(42, 'Count')              → '42'
 */
export function formatKpiValue(
    value: number | string | null | undefined, 
    metricLabel: string = '',
    activeAgg?: string
): string {
    if (value === null || value === undefined) return '—';

    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return String(value);

    // If counting records, bypass currency rules
    const isCount = activeAgg === 'COUNT';
    const isVar = activeAgg === 'VAR_SAMP';
    
    const isCurrency = !isCount && !isVar && isCurrencyMetric(metricLabel);
    const isPercent = !isCount && !isVar && isPercentageMetric(metricLabel);

    // Handle percentage-like ratios (0.0 to 1.0)
    if (isPercent && Math.abs(num) <= 1.0) {
        return `${(num * 100).toFixed(1)}%`;
    }

    // Handle explicit percentages (including those > 100)
    if (isPercent) {
        return `${num.toFixed(1)}%`;
    }

    const prefix = isCurrency ? '$' : '';
    const suffix = isVar ? ' (var)' : '';
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (absNum >= 1_000_000_000) {
        return `${sign}${prefix}${(absNum / 1_000_000_000).toFixed(1)}B${suffix}`;
    }
    if (absNum >= 1_000_000) {
        return `${sign}${prefix}${(absNum / 1_000_000).toFixed(1)}M${suffix}`;
    }
    if (absNum >= 1_000) {
        return `${sign}${prefix}${(absNum / 1_000).toFixed(1)}K${suffix}`;
    }
    if (Number.isInteger(num)) {
        return `${sign}${prefix}${absNum.toLocaleString()}${suffix}`;
    }
    return `${sign}${prefix}${absNum.toFixed(2)}${suffix}`;
}

/**
 * Generate a professional KPI subtext label from the metric and aggregation type.
 */
export function formatKpiSubtext(metricName: string, aggregation: string = 'SUM'): string {
    const humanMetric = metricName
        .replace(/[_\-]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    const aggLabel = aggregation.charAt(0) + aggregation.slice(1).toLowerCase();
    return `${aggLabel} of ${humanMetric}`;
}
