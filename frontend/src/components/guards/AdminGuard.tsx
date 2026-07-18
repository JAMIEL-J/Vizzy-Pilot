import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { apiClient } from '../../lib/api/client';

interface AdminGuardProps {
    children: ReactNode;
}

/**
 * AdminGuard protects admin routes by verifying user has admin role.
 * Redirects to admin login if not authenticated or not an admin.
 */
export default function AdminGuard({ children }: AdminGuardProps) {
    const location = useLocation();
    const [isChecking, setIsChecking] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false);

    useEffect(() => {
        // Check if csrf_token cookie exists (proxy for being logged in)
        const hasCsrf = document.cookie.split('; ').some(row => row.startsWith('csrf_token='));
        
        if (!hasCsrf) {
            setIsAuthorized(false);
            setIsChecking(false);
            return;
        }

        // Verify admin role by making an authenticated API call
        apiClient.get('/admin/stats')
            .then(() => {
                setIsAuthorized(true);
            })
            .catch(() => {
                setIsAuthorized(false);
            })
            .finally(() => {
                setIsChecking(false);
            });
    }, []);

    if (isChecking) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-admin-blue"></div>
            </div>
        );
    }

    if (!isAuthorized) {
        return <Navigate to="/admin/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
}
