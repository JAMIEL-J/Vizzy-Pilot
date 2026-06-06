import { apiClient as api } from '../lib/api/client';
import { AxiosError } from 'axios';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface Recommendation {
    id: string;
    issue_type: 'missing_values' | 'outliers' | 'duplicates';
    column: string | null;
    severity: 'low' | 'medium' | 'high';
    strategy: string; // e.g., 'fill_mean', 'drop_rows'
    strategy_options: string[];
    description: string;
    impact: string;
}

export interface HealthScore {
    score: number;
    grade: string;
    breakdown: {
        missing_values_penalty: number;
        outliers_penalty: number;
        duplicates_penalty: number;
        other_penalty: number;
    };
}

export interface InspectionReport {
    id: string;
    dataset_version_id: string;
    issues_detected: {
        health_score?: HealthScore;
        recommendations?: Recommendation[];
        [key: string]: any;
    };
    risk_level: RiskLevel;
    summary: string;
    generated_by: string;
    is_active: boolean;
}

export interface CleaningPlan {
    id: string;
    dataset_version_id: string;
    proposed_actions: Record<string, any>; // Flexible dict for now
    approved: boolean;
    approved_by: string | null;
    approved_at: string | null;
    is_active: boolean;
}

const getErrorDetail = (error: unknown): string => {
    if (!(error instanceof AxiosError)) return '';
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') return JSON.stringify(detail);
    return '';
};

const isExistingInspectionConflict = (error: unknown): boolean => {
    const detail = getErrorDetail(error).toLowerCase();
    return (
        error instanceof AxiosError &&
        error.response?.status === 409 &&
        detail.includes('active inspection report already exists')
    );
};

export const cleaningService = {
    // Run a new inspection (re-scan)
    runInspection: async (versionId: string): Promise<InspectionReport> => {
        try {
            const response = await api.post<InspectionReport>(`/versions/${versionId}/inspection`);
            return response.data;
        } catch (error) {
            if (isExistingInspectionConflict(error)) {
                const response = await api.get<InspectionReport>(`/versions/${versionId}/inspection`);
                return response.data;
            }
            throw error;
        }
    },

    // Get existing inspection report
    getInspection: async (versionId: string): Promise<InspectionReport> => {
        const response = await api.get<InspectionReport>(`/versions/${versionId}/inspection`);
        return response.data;
    },

    // Create a cleaning plan (stage fixes)
    createPlan: async (versionId: string, proposedActions: Record<string, any>): Promise<CleaningPlan> => {
        const response = await api.post<CleaningPlan>(`/versions/${versionId}/cleaning`, {
            proposed_actions: proposedActions
        });
        return response.data;
    },

    // Get existing cleaning plan
    getPlan: async (versionId: string): Promise<CleaningPlan> => {
        const response = await api.get<CleaningPlan>(`/versions/${versionId}/cleaning`);
        return response.data;
    },

    // Approve the plan
    // Backend route is: /versions/{version_id}/cleaning/{plan_id}/approve
    approvePlan: async (versionId: string, planId: string): Promise<CleaningPlan> => {
        const response = await api.post<CleaningPlan>(`/versions/${versionId}/cleaning/${planId}/approve`);
        return response.data;
    },

    // Execute an approved plan (apply fixes and save cleaned data)
    executePlan: async (versionId: string, planId: string): Promise<Record<string, any>> => {
        const response = await api.post<Record<string, any>>(`/versions/${versionId}/cleaning/${planId}/execute`);
        return response.data;
    },

    // Preview a cleaning plan (dry-run on a sample of data)
    previewPlan: async (versionId: string, proposedActions: Record<string, any>): Promise<Record<string, any>> => {
        const response = await api.post<Record<string, any>>(`/versions/${versionId}/cleaning/preview`, {
            proposed_actions: proposedActions
        });
        return response.data;
    },
};
