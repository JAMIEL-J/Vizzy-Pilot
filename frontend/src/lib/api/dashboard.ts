import { apiClient } from './client';

export interface SavedDashboard {
    id: string;
    name: string;
    description?: string;
    config: any;
    dataset_id?: string;
    dataset_version_id?: string;
    is_public: boolean;
    created_at?: string;
    updated_at?: string;
}

export const dashboardService = {
    // Save new dashboard
    saveDashboard: async (data: {
        name: string;
        description?: string;
        config: any;
        dataset_id?: string;
        dataset_version_id?: string;
        is_public?: boolean;
    }) => {
        const response = await apiClient.post<SavedDashboard>('/dashboards', data);
        return response.data;
    },

    // List dashboards
    listDashboards: async (includePublic = true, limit = 50) => {
        const response = await apiClient.get<{ dashboards: SavedDashboard[]; total: number }>('/dashboards', {
            params: { include_public: includePublic, limit }
        });
        return response.data;
    },

    // Get dashboard
    getDashboard: async (dashboardId: string) => {
        const response = await apiClient.get<SavedDashboard>(`/dashboards/${dashboardId}`);
        return response.data;
    },

    // Update dashboard
    updateDashboard: async (dashboardId: string, data: Partial<SavedDashboard>) => {
        const response = await apiClient.patch<SavedDashboard>(`/dashboards/${dashboardId}`, data);
        return response.data;
    },

    // Delete dashboard
    deleteDashboard: async (dashboardId: string) => {
        await apiClient.delete(`/dashboards/${dashboardId}`);
    }
};

// Analytics types
export interface DashboardAnalytics {
    dataset_name: string;
    total_rows: number;
    domain: string;
    domain_confidence: string;
    kpis: Record<string, { title: string; value: number; format: string; icon?: string; confidence?: string; trend?: number; trend_label?: string; subtitle?: string }>;
    charts: Record<string, {
        title: string;
        data: any[];
        type: string;
        confidence?: string;
        categories?: string[];
        geo_meta?: { map_type: 'world' | 'us_states'; geo_col: string; metric_col: string };
        format_type?: string;
        value_label?: string;
        dimension?: string;
        metric?: string;
        aggregation?: string;
        granularity?: string;
        section?: string;
    }>;
    columns: {
        dimensions: string[];
        metrics: string[];
        targets: string[];
        dates: string[];
        excluded: string[];
    };
    target_column?: string;
    target_values?: string[];
    geo_filters?: Record<string, string[]>;
    raw_data?: any[];
    chart_configs?: Record<string, {
        title: string;
        type: string;
        dimension?: string;
        metric?: string;
        aggregation?: string;
    }>;
    data_quality?: { column: string; null_pct: number; null_count: number; dtype: string; action: string }[];
}

export const analyticsService = {
    // Get dashboard analytics
    getDashboardAnalytics: async (
        datasetId?: string,
        targetValue?: string,
        filters?: Record<string, string[]>,
        chartOverrides?: Record<string, any>,
        classificationOverrides?: Record<string, any>,
        selectedDomain?: string | null,
        signal?: AbortSignal
    ) => {
        const payload: any = {
            active_filters: {},
            chart_overrides: chartOverrides || {},
            classification_overrides: classificationOverrides || {},
            selected_domain: selectedDomain || null
        };
        if (datasetId) payload.dataset_id = datasetId;
        if (targetValue) payload.target_value = targetValue;
        if (filters && Object.keys(filters).length > 0) {
            // Only send non-empty filter arrays
            const active = Object.fromEntries(
                Object.entries(filters).filter(([, v]) => v.length > 0)
            );
            if (Object.keys(active).length > 0) payload.active_filters = active;
        }
        const response = await apiClient.post<DashboardAnalytics>('/analytics/dashboard', payload, { signal });
        return response.data;
    },

    // Get pivot table data
    getPivotData: async (datasetId: string) => {
        const response = await apiClient.get<{ success: boolean; domain: string; pivot: any }>('/analytics/pivot', {
            params: { dataset_id: datasetId }
        });
        return response.data;
    }
};

// Correlation types
export interface CorrelationMatrix {
    labels: string[];
    displayLabels: string[];
    matrix: number[][];
    pairs: { row: number; col: number; rowLabel: string; colLabel: string; value: number }[];
    n: number;
}

export const correlationService = {
    getMatrix: async (datasetId: string, maxCols = 10): Promise<CorrelationMatrix> => {
        const response = await apiClient.get<CorrelationMatrix>('/analytics/correlation', {
            params: { dataset_id: datasetId, max_cols: maxCols }
        });
        return response.data;
    }
};

export const narrativeService = {
    generate: async (
        datasetId: string,
        kpis: Record<string, any>,
        domain: string,
        datasetName: string,
        charts?: Record<string, any>,
    ): Promise<string> => {
        const payload: any = {
            dataset_id: datasetId,
            kpis,
            domain,
            dataset_name: datasetName,
        };
        if (charts) payload.charts = charts;
        const response = await apiClient.post<{ narrative: string }>('/analytics/narrative', payload);
        return response.data.narrative;
    }
};
