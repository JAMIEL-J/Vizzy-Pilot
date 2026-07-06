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
    status: 'building' | 'ready' | 'failed' | 'converting' | 'error' | string;
    ready?: boolean;
    error?: string | null;
    duckdb_path?: string | null;
    schema?: Array<{ name: string; dtype: string; nullable: boolean }> | null;
    row_count?: number | null;
}

export interface DatasetVersionSummary {
    id: string;
    dataset_id: string;
    version_number: number;
    source_type: string;
    row_count?: number | null;
    schema_hash: string;
    created_by: string;
    is_active: boolean;
    parent_version_id?: string | null;
    semantic_map_json?: string | null;
    created_at?: string;
}

export interface VersionListResponse {
    versions: DatasetVersionSummary[];
}

export interface DatasetMetadata {
    dataset_id: string;
    version_id: string;
    column_count: number;
    columns: string[];
    raw_size: number;
    cleaned_size?: number | null;
}

export interface ColumnProfileData {
    dtype: string;
    samples: any[];
    is_numeric: boolean;
    is_datetime: boolean;
    cardinality: number | null;
    unique_count: number | null;
    min?: number | string | null;
    max?: number | string | null;
    mean?: number | null;
    is_currency_pattern?: boolean;
    top_values?: string[] | null;
}

export interface MappingProposalItem {
    column_name: string;
    role: string;
    evidence: string;
    confidence: number;
    status?: string;
    profile?: ColumnProfileData | null;
}

export interface MappingProposalResponse {
    version_id: string;
    proposal: {
        error?: string;
        metadata?: {
            proposals: MappingProposalItem[];
        };
    };
}

export const datasetService = {
    listDatasets: async () => {
        const response = await apiClient.get<{ datasets: Dataset[] }>('/datasets');
        return response.data.datasets;
    },

    createDataset: async (name: string, description?: string) => {
        const response = await apiClient.post<Dataset>('/datasets', { name, description });
        return response.data;
    },

    getDataset: async (datasetId: string) => {
        const response = await apiClient.get<Dataset>(`/datasets/${datasetId}`);
        return response.data;
    },

    getDuckdbStatus: async (datasetId: string) => {
        const response = await apiClient.get<DuckDBStatus>(`/datasets/${datasetId}/status`);
        return response.data;
    },

    getDatasetMetadata: async (datasetId: string) => {
        const response = await apiClient.get<DatasetMetadata>(`/datasets/${datasetId}/metadata`);
        return response.data;
    },

    listVersionsForDataset: async (datasetId: string) => {
        const response = await apiClient.get<VersionListResponse>(`/datasets/${datasetId}/versions`);
        return response.data.versions;
    },

    getLatestVersion: async (datasetId: string) => {
        const response = await apiClient.get<DatasetVersionSummary>(`/datasets/${datasetId}/versions/latest`);
        return response.data;
    },

    getVersion: async (versionId: string) => {
        const response = await apiClient.get<any>(`/datasets/versions/${versionId}`);
        return response.data;
    },

    deleteDataset: async (datasetId: string) => {
        await apiClient.delete(`/datasets/${datasetId}`);
    },

    deleteVersion: async (datasetId: string, versionId: string) => {
        await apiClient.delete(`/datasets/${datasetId}/versions/${versionId}`);
    },

    downloadRaw: async (datasetId: string) => {
        const response = await apiClient.get(`/datasets/${datasetId}/download/raw`, { responseType: 'blob' });
        return response.data;
    },

    downloadCleaned: async (datasetId: string) => {
        const response = await apiClient.get(`/datasets/${datasetId}/download/cleaned`, { responseType: 'blob' });
        return response.data;
    },

    getDownloadHistory: async () => {
        const response = await apiClient.get<DownloadHistoryItem[]>('/datasets/downloads/history');
        return response.data;
    }
};

export interface DownloadHistoryItem {
    dataset_id: string;
    dataset_name: string;
    version_id: string;
    version_number: number;
    download_type: 'raw' | 'cleaned' | string;
    timestamp: string;
}


export const uploadService = {
    uploadFile: async (datasetId: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await apiClient.post(`/datasets/${datasetId}/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    /** Upload a file and create the dataset atomically (single request). */
    uploadNewDataset: async (file: File, name: string, description?: string) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);
        if (description) {
            formData.append('description', description);
        }
        const response = await apiClient.post('/datasets/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data as {
            dataset_id: string;
            version_id: string;
            version_number: number;
            row_count: number;
            schema_hash: string;
            raw_path: string;
            schema: Array<{ name: string; dtype: string }>;
            dashboard?: any;
            semantic_map?: string | null;
        };
    }
};

export interface MappingCorrectionItem {
    column: string;
    proposed_role: string;
    corrected_role: string;
}

export const semanticMappingService = {
    proposeMapping: async (datasetId: string, versionId: string) => {
        const response = await apiClient.post<MappingProposalResponse>(
            `/datasets/${datasetId}/versions/${versionId}/propose-mapping`
        );
        return response.data;
    },

    previewRemap: async (datasetId: string, versionId: string, proposedMap: Record<string, string>) => {
        const response = await apiClient.post<any>(`/datasets/${datasetId}/versions/${versionId}/remap/preview`, {
            mappings: proposedMap
        });
        return response.data;
    },

    confirmMapping: async (datasetId: string, versionId: string, mappings: Record<string, string>, corrections?: MappingCorrectionItem[]) => {
        const response = await apiClient.post<DatasetVersionSummary>(
            `/datasets/${datasetId}/versions/${versionId}/confirm-mapping`,
            { mappings, corrections }
        );
        return response.data;
    },

    remapMapping: async (datasetId: string, versionId: string, mappings: Record<string, string>) => {
        const response = await apiClient.post<DatasetVersionSummary>(
            `/datasets/${datasetId}/versions/${versionId}/remap/confirm`,
            { mappings }
        );
        return response.data;
    },
};
