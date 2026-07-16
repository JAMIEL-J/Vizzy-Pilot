import { create } from 'zustand';
import type { User } from '../../types';

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
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        
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
