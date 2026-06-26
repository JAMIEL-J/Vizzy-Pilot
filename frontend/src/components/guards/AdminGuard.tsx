import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';

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
        // Check for access token and admin role
        const token = localStorage.getItem('access_token');

        if (!token) {
            setIsAuthorized(false);
            setIsChecking(false);
            return;
        }

        // Decode JWT to check role (simple client-side check)
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const isAdmin = payload.role === 'admin';
            setIsAuthorized(isAdmin);
        } catch {
            setIsAuthorized(false);
        }

        setIsChecking(false);
    }, []);

    if (isChecking) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-admin-blue"></div>
            </div>
        );
    }

    if (!isAuthorized) {
        // Redirect to admin login with return URL
        return <Navigate to="/admin/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
}
