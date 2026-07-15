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

    /**
     * Delete a field from the schema.
     */
    deleteField: async (datasetId: string, fieldName: string) => {
        const response = await apiClient.delete<CanvasSchemaResponse>(`/datasets/${datasetId}/canvas/fields/${encodeURIComponent(fieldName)}`);
        return response.data;
    },

    // Compile AI Prompt into chart spec directly and statelessly
    compilePrompt: async (datasetId: string, versionId: string | null, prompt: string, forceDeepAnalysis = false) => {
        const response = await apiClient.post<{
            success: boolean;
            sql: string;
            chart: any;
            explanation: any;
            timing: any;
            error: string | null;
        }>(`/datasets/${datasetId}/canvas/compile`, {
            prompt,
            version_id: versionId,
            force_deep_analysis: forceDeepAnalysis
        });
        return response.data;
    },
};

export interface NumberFormatConfig {
    type: 'automatic' | 'number_standard' | 'number_custom' | 'currency_standard' | 'currency_custom' | 'scientific' | 'percentage' | 'fraction' | 'standard_custom';
    decimals?: number;
    negativeStyle?: 'minus' | 'parentheses' | 'red';
    prefix?: string;
    suffix?: string;
    separator?: ',' | '.' | ' ' | 'none' | string;
    unit?: 'none' | 'K' | 'M' | 'B' | 'auto';
}

// Convert decimal values to standard mathematical fraction string
function decimalToFraction(val: number): string {
    if (Number.isInteger(val)) return String(val);
    const absVal = Math.abs(val);
    const tolerance = 1.0e-9;
    let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
    let b = absVal;
    do {
        const a = Math.floor(b);
        const aux = h1; h1 = a * h1 + h2; h2 = aux;
        const aux2 = k1; k1 = a * k1 + k2; k2 = aux2;
        b = 1 / (b - a);
    } while (Math.abs(absVal - h1 / k1) > absVal * tolerance && k1 < 100);
    
    const sign = val < 0 ? '-' : '';
    if (k1 > 100) {
        return sign + absVal.toFixed(2);
    }
    
    if (h1 > k1) {
        const whole = Math.floor(h1 / k1);
        const rem = h1 % k1;
        if (rem === 0) return `${sign}${whole}`;
        return `${sign}${whole} ${rem}/${k1}`;
    }
    
    return `${sign}${h1}/${k1}`;
}

// Convert numbers into scientific notation (e.g. 1.50 × 10⁶)
function formatScientific(num: number, decimals: number = 2): string {
    const expStr = num.toExponential(decimals);
    const [base, exp] = expStr.split('e');
    const expNum = parseInt(exp, 10);
    
    const superscriptMap: Record<string, string> = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
        '-': '⁻', '+': '⁺'
    };
    
    const expSuperscript = String(expNum)
        .split('')
        .map(c => superscriptMap[c] || c)
        .join('');
        
    return `${base} × 10${expSuperscript}`;
}

// Handle customizable number formatting for standard, custom, percentage, and currency types
function formatCustom(num: number, config: NumberFormatConfig): string {
    let val = num;
    
    if (config.type === 'percentage') {
        val = val * 100;
    }
    
    const decimals = config.decimals !== undefined ? config.decimals : 2;
    
    let unitSuffix = '';
    if (config.unit && config.unit !== 'none') {
        let absVal = Math.abs(val);
        let selectedUnit: string = config.unit;
        if (selectedUnit === 'auto') {
            if (absVal >= 1_000_000_000) selectedUnit = 'B';
            else if (absVal >= 1_000_000) selectedUnit = 'M';
            else if (absVal >= 1_000) selectedUnit = 'K';
            else selectedUnit = 'none';
        }
        
        if (selectedUnit === 'B') {
            val = val / 1_000_000_000;
            unitSuffix = 'B';
        } else if (selectedUnit === 'M') {
            val = val / 1_000_000;
            unitSuffix = 'M';
        } else if (selectedUnit === 'K') {
            val = val / 1_000;
            unitSuffix = 'K';
        }
    }
    
    let formattedNum = Math.abs(val).toFixed(decimals);
    
    if (config.separator !== 'none') {
        const parts = formattedNum.split('.');
        const thousandSeparator = config.separator || ',';
        const decimalSeparator = thousandSeparator === ',' ? '.' : ',';
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandSeparator);
        formattedNum = parts.join(decimalSeparator);
    }
    
    const prefix = config.prefix || '';
    const suffix = (config.suffix || '') + unitSuffix;
    
    const isNegative = num < 0;
    if (isNegative) {
        if (config.negativeStyle === 'parentheses') {
            return `(${prefix}${formattedNum}${suffix})`;
        }
        return `-${prefix}${formattedNum}${suffix}`;
    }
    
    return `${prefix}${formattedNum}${suffix}`;
}

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
 */
export function formatKpiValue(
    value: number | string | null | undefined, 
    metricLabel: string = '',
    activeAgg?: string,
    formatConfig?: NumberFormatConfig
): string {
    if (value === null || value === undefined) return '—';

    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return String(value);

    // Process explicit formatting configurations
    if (formatConfig && formatConfig.type !== 'automatic') {
        switch (formatConfig.type) {
            case 'number_standard':
                return formatCustom(num, {
                    type: 'number_standard',
                    decimals: 2,
                    separator: ',',
                    negativeStyle: formatConfig.negativeStyle || 'minus'
                });
            case 'number_custom':
                return formatCustom(num, formatConfig);
            case 'currency_standard':
                return formatCustom(num, {
                    type: 'currency_standard',
                    decimals: 2,
                    prefix: '$',
                    separator: ',',
                    negativeStyle: formatConfig.negativeStyle || 'minus'
                });
            case 'currency_custom':
                return formatCustom(num, formatConfig);
            case 'scientific':
                return formatScientific(num, formatConfig.decimals !== undefined ? formatConfig.decimals : 2);
            case 'percentage':
                return formatCustom(num, {
                    type: 'percentage',
                    decimals: formatConfig.decimals !== undefined ? formatConfig.decimals : 1,
                    suffix: '%',
                    separator: formatConfig.separator || ',',
                    negativeStyle: formatConfig.negativeStyle || 'minus'
                });
            case 'fraction':
                return decimalToFraction(num);
            case 'standard_custom':
                return formatCustom(num, {
                    ...formatConfig,
                    prefix: formatConfig.prefix || '',
                    suffix: formatConfig.suffix || ''
                });
        }
    }

    // Default Automatic Display Logic
    const isCount = activeAgg === 'COUNT';
    const isVar = activeAgg === 'VAR_SAMP';
    const isPercentChange = activeAgg === 'PERCENT_CHANGE';
    
    const isCurrency = !isCount && !isVar && !isPercentChange && isCurrencyMetric(metricLabel);
    const isPercent = isPercentChange || (!isCount && !isVar && isPercentageMetric(metricLabel));

    if (isPercent && Math.abs(num) <= 1.0 && !isPercentChange) {
        return `${(num * 100).toFixed(1)}%`;
    }

    if (isPercent) {
        const sign = isPercentChange && num > 0 ? '+' : '';
        return `${sign}${num.toFixed(1)}%`;
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
