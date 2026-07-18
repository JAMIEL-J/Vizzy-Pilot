import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

function getCsrfToken(): string | undefined {
    return document.cookie
        .split('; ')
        .find(row => row.startsWith('csrf_token='))
        ?.split('=')[1];
}

export const apiClient = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});

// Request interceptor to add CSRF token
apiClient.interceptors.request.use(
    (config) => {
        const csrfToken = getCsrfToken();
        if (csrfToken) {
            config.headers['X-CSRF-Token'] = csrfToken;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle token refresh + 503 retry
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Retry once on 503 (transient DB contention)
        if (error.response?.status === 503 && !originalRequest._retried503) {
            originalRequest._retried503 = true;
            await new Promise((r) => setTimeout(r, 800));
            return apiClient(originalRequest);
        }

        // If 401 and not already retried
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                // refresh_token cookie is sent automatically via withCredentials
                await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });

                // Retry original request — new access_token cookie is set by backend
                return apiClient(originalRequest);
            } catch (refreshError) {
                // Refresh failed, logout — clear cookies via backend
                try {
                    await axios.post(`${API_URL}/auth/logout`, {}, { withCredentials: true });
                } catch { /* ignore */ }
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);
