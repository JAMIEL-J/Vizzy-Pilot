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
    sendMessage: async (sessionId: string, content: string, signal?: AbortSignal) => {
        const response = await apiClient.post<{
            user_message: ChatMessage;
            assistant_message: ChatMessage
        }>(`/chat/sessions/${sessionId}/messages`, {
            content
        }, { signal });
        return response.data;
    }
};
