import { create } from 'zustand';
import type { User } from '../../types';
import { apiClient } from '../api/client';

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    setUser: (user: User | null) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isAuthenticated: false,

    setUser: (user) => set({ user, isAuthenticated: !!user }),

    logout: () => {
        // Clear HttpOnly cookies via backend
        apiClient.post('/auth/logout').catch(() => {});
        
        // Clear all canvas / user-session layout cache keys
        localStorage.removeItem('vizzy_canvas_widgets');
        localStorage.removeItem('vizzy_last_dataset_id');
        localStorage.removeItem('vizzy_last_version_id');
        localStorage.removeItem('vizzy_last_loaded_dashboard_id');
        localStorage.removeItem('vizzy_last_loaded_dashboard_name');
        localStorage.removeItem('vizzy_pinned_charts');
        localStorage.removeItem('vizzy_canvas_gridSnap');
        localStorage.removeItem('vizzy_canvas_showGridlines');
        localStorage.removeItem('vizzy_canvas_autoSaveEnabled');
        
        set({ user: null, isAuthenticated: false });
    },
}));
