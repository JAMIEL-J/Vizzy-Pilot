import { apiClient } from './client';

export interface ChatSession {
    id: string;
    title: string;
    message_count: number;
    dataset_id?: string;
    dataset_version_id?: string;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    output_data?: any;
    intent_type?: string;
    sequence: number;
    timestamp?: string; // Often added by frontend if not in API, but good to have
}

export const chatService = {
    // List all sessions
    listSessions: async (limit = 50) => {
        const response = await apiClient.get<{ sessions: ChatSession[] }>('/chat/sessions', {
            params: { limit }
        });
        return response.data.sessions;
    },

    // Create a new session
    createSession: async (datasetId?: string, datasetVersionId?: string, title?: string) => {
        const response = await apiClient.post<ChatSession>('/chat/sessions', {
            dataset_id: datasetId,
            dataset_version_id: datasetVersionId,
            title
        });
        return response.data;
    },

    // Get a specific session
    getSession: async (sessionId: string) => {
        const response = await apiClient.get<ChatSession>(`/chat/sessions/${sessionId}`);
        return response.data;
    },

    // Update session title
    updateSession: async (sessionId: string, title: string) => {
        const response = await apiClient.patch<ChatSession>(`/chat/sessions/${sessionId}`, {
            title
        });
        return response.data;
    },

    // Delete session
    deleteSession: async (sessionId: string) => {
        await apiClient.delete(`/chat/sessions/${sessionId}`);
    },

    // Get messages for a session
    getMessages: async (sessionId: string, limit = 100) => {
        const response = await apiClient.get<{ messages: ChatMessage[] }>(`/chat/sessions/${sessionId}/messages`, {
            params: { limit }
        });
        return response.data.messages;
    },

    // Send a message
    sendMessage: async (
        sessionId: string, 
        content: string, 
        signal?: AbortSignal,
        options?: { forceDeepAnalysis?: boolean; enableSuggestions?: boolean }
    ) => {
        const response = await apiClient.post<{
            user_message: ChatMessage;
            assistant_message: ChatMessage
        }>(`/chat/sessions/${sessionId}/messages`, {
            content,
            force_deep_analysis: options?.forceDeepAnalysis ?? false,
            enable_suggestions: options?.enableSuggestions ?? false
        }, { signal });
        return response.data;
    },

    // Send a message with SSE progress stream
    sendMessageStream: async (
        sessionId: string,
        content: string,
        onProgress: (progress: { step: number; total: number; phase: string; detail: string; query_index?: number; query_total?: number }) => void,
        signal?: AbortSignal,
        options?: { forceDeepAnalysis?: boolean; enableSuggestions?: boolean }
    ): Promise<{ user_message: ChatMessage; assistant_message: ChatMessage }> => {
        const token = localStorage.getItem('access_token');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
        const response = await fetch(`${API_URL}/chat/sessions/${sessionId}/messages/stream`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                content,
                force_deep_analysis: options?.forceDeepAnalysis ?? false,
                enable_suggestions: options?.enableSuggestions ?? false
            }),
            signal
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('ReadableStream not supported');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let result: { user_message: ChatMessage; assistant_message: ChatMessage } | null = null;

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split('\n\n');
                buffer = parts.pop() || '';

                for (const part of parts) {
                    if (!part.trim()) continue;

                    const lines = part.split('\n');
                    let eventType = '';
                    let eventData = '';

                    for (const line of lines) {
                        if (line.startsWith('event:')) {
                            eventType = line.substring(6).trim();
                        } else if (line.startsWith('data:')) {
                            eventData = line.substring(5).trim();
                        }
                    }

                    if (eventType === 'progress' && eventData) {
                        try {
                            const data = JSON.parse(eventData);
                            onProgress(data);
                        } catch (e) {
                            console.error('Failed to parse progress event data:', e);
                        }
                    } else if (eventType === 'complete' && eventData) {
                        try {
                            result = JSON.parse(eventData);
                        } catch (e) {
                            console.error('Failed to parse complete event data:', e);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        if (!result) {
            throw new Error('Stream ended without complete event');
        }

        return result;
    },

    // Get initial suggestions
    getInitialSuggestions: async (sessionId: string) => {
        const response = await apiClient.get<{ suggestions: string[] }>(`/chat/sessions/${sessionId}/suggestions`);
        return response.data.suggestions;
    },

    // Execute custom SQL query against a dataset
    executeSql: async (datasetId: string, sql: string, maxRows = 1000) => {
        const response = await apiClient.post<any>(`/datasets/${datasetId}/sql/execute`, {
            sql,
            max_rows: maxRows
        });
        return response.data;
    }
};
