import { apiClient } from '../lib/api/client';

// Types
export interface JoinColumn {
  left_column: string;
  right_column: string;
}

export interface JoinConfig {
  join_id: string;
  left_table: string;
  right_table: string;
  join_type: 'inner' | 'left' | 'right' | 'outer' | 'cross';
  columns: JoinColumn[];
  alias?: string;
}

export interface TableColumnInfo {
  name: string;
  type: string;
}

export interface TableInfo {
  table_name: string;
  original_filename: string;
  row_count?: number;
  columns: TableColumnInfo[];
  is_primary: boolean;
}

export interface TablesListResponse {
  tables: TableInfo[];
  version_id: string;
  has_join_view: boolean;
  active_join_view?: string;
}

export interface JoinListResponse {
  joins: JoinConfig[];
  available_tables: string[];
}

export interface JoinValidationResponse {
  is_valid: boolean;
  reason: string;
  estimated_output_rows?: number;
  sample_output?: Record<string, any>[];
}

export interface ApplyJoinResponse {
  success: boolean;
  view_name: string;
  sql: string;
  row_count: number;
  columns: TableColumnInfo[];
  joins_applied: number;
}

// API Functions

export async function listDatasetTables(datasetId: string): Promise<TablesListResponse> {
  const response = await apiClient.get(`/datasets/${datasetId}/tables`);
  return response.data;
}

export async function listJoins(datasetId: string): Promise<JoinListResponse> {
  const response = await apiClient.get(`/datasets/${datasetId}/joins`);
  return response.data;
}

export async function createJoin(
  datasetId: string,
  config: Omit<JoinConfig, 'join_id'>
): Promise<JoinConfig> {
  const response = await apiClient.post(`/datasets/${datasetId}/joins`, config);
  return response.data;
}

export async function deleteJoin(datasetId: string, joinId: string): Promise<void> {
  await apiClient.delete(`/datasets/${datasetId}/joins/${joinId}`);
}

export async function validateJoin(
  datasetId: string,
  config: {
    left_table: string;
    right_table: string;
    join_type: string;
    columns: JoinColumn[];
  }
): Promise<JoinValidationResponse> {
  const response = await apiClient.post(`/datasets/${datasetId}/joins/validate`, config);
  return response.data;
}

export async function applyJoins(
  datasetId: string,
  versionId: string,
  viewName: string = 'joined_view'
): Promise<ApplyJoinResponse> {
  const response = await apiClient.post(
    `/datasets/${datasetId}/versions/${versionId}/join`,
    { view_name: viewName }
  );
  return response.data;
}

export async function uploadMultipleFiles(
  datasetId: string,
  files: File[]
): Promise<any> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });
  const response = await apiClient.post(
    `/datasets/${datasetId}/upload/multiple`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}
