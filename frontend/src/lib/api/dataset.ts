import { apiClient } from './client';

export interface Dataset {
    id: string;
    name: string;
    description?: string;
    owner_id: string;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
    current_version_id?: string;
}

export interface DuckDBStatus {
    dataset_id: string;
    version_id: string;
    status: 'building' | 'ready' | 'failed' | string;
    ready: boolean;
    error?: string | null;
    duckdb_path?: string | null;
}

export interface DatasetVersionSummary {
    id: string;
    dataset_id: string;
    version_number: number;
    source_type: string;
    source_reference: string;
    row_count?: number | null;
    schema_hash: string;
    created_by: string;
    is_active: boolean;
}

export const datasetService = {
    // List datasets
    listDatasets: async () => {
        const response = await apiClient.get<{ datasets: Dataset[] }>('/datasets');
        return response.data.datasets;
    },

    // Create dataset (metadata only)
    createDataset: async (name: string, description?: string) => {
        const response = await apiClient.post<Dataset>('/datasets', {
            name,
            description
        });
        return response.data;
    },

    // Get single dataset
    getDataset: async (datasetId: string) => {
        const response = await apiClient.get<Dataset>(`/datasets/${datasetId}`);
        return response.data;
    },

    // Get DuckDB build status for latest dataset version
    getDuckdbStatus: async (datasetId: string) => {
        const response = await apiClient.get<DuckDBStatus>(`/datasets/${datasetId}/duckdb-status`);
        return response.data;
    },

    // Get latest dataset version metadata (contains row_count when available)
    getLatestVersion: async (datasetId: string) => {
        const response = await apiClient.get<DatasetVersionSummary>(`/datasets/${datasetId}/versions/latest`);
        return response.data;
    },

    // Delete dataset
    deleteDataset: async (datasetId: string) => {
        await apiClient.delete(`/datasets/${datasetId}`);
    },

    // Download raw dataset
    downloadRaw: async (datasetId: string) => {
        const response = await apiClient.get(`/datasets/${datasetId}/download/raw`, {
            responseType: 'blob'
        });
        return response.data;
    },

    // Download cleaned dataset
    downloadCleaned: async (datasetId: string) => {
        const response = await apiClient.get(`/datasets/${datasetId}/download/cleaned`, {
            responseType: 'blob'
        });
        return response.data;
    }
};

export const uploadService = {
    // Upload file to dataset
    uploadFile: async (datasetId: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.post(`/datasets/${datasetId}/upload`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    }
};
