import { apiClient } from './client';

export interface ProfileUsageItem {
    feature: string;
    count: number;
}

export interface MonthlyActivityItem {
    month: string;
    datasets: number;
    uploads: number;
    saved_dashboards: number;
    generated_dashboards: number;
    chats: number;
    analyses: number;
}

export interface UserProfileStats {
    user: {
        id: string;
        name?: string | null;
        email: string;
        role: 'user' | 'admin' | string;
        is_active: boolean;
        created_at?: string;
    };
    totals: {
        total_datasets: number;
        total_uploads: number;
        total_dashboards_generated: number;
        total_saved_dashboards: number;
        total_chat_sessions: number;
        total_chat_messages: number;
        total_analyses: number;
        total_analysis_contracts: number;
        total_cleaning_plans: number;
        total_inspection_reports: number;
    };
    analysis_type_counts?: {
        dashboard: number;
        analysis_chart: number;
        text_query: number;
        interpretive: number;
        other: number;
    };
    feature_usage: ProfileUsageItem[];
    monthly_activity: MonthlyActivityItem[];
    dataset_sources: Record<string, number>;
}

export const userApi = {
    getProfileStats: async () => {
        const response = await apiClient.get<UserProfileStats>('/users/me/profile');
        return response.data;
    },

    updateMyProfile: async (payload: { name?: string; email?: string }) => {
        const response = await apiClient.patch<UserProfileStats['user']>('/users/me', payload);
        return response.data;
    },

    getLLMSettings: async () => {
        const response = await apiClient.get<LLMSettings>('/users/me/llm-settings');
        return response.data;
    },

    updateLLMSettings: async (payload: LLMSettingsUpdate) => {
        const response = await apiClient.put<LLMSettings>('/users/me/llm-settings', payload);
        return response.data;
    },
};

export interface LLMSettings {
    provider: 'default' | 'openai' | 'gemini' | 'ollama' | string;
    has_openai_key: boolean;
    has_gemini_key: boolean;
    ollama_url?: string;
    ollama_model?: string;
}

export interface LLMSettingsUpdate {
    provider: string;
    openai_api_key?: string | null;
    gemini_api_key?: string | null;
    ollama_url?: string;
    ollama_model?: string;
}

