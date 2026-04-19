import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/store/authStore';
import ThemeToggle from '../ui/ThemeToggle';
import { Button } from '@/components/ui/button';

type NavItem = {
    path: string;
    label: string;
    icon: string;
};

const NAV_ITEMS: NavItem[] = [
    { path: '/user/dashboard', label: 'Analytics', icon: 'analytics' },
    { path: '/user/datasets', label: 'Datasets', icon: 'database' },
    { path: '/user/upload', label: 'Upload', icon: 'upload' },
    { path: '/user/chat', label: 'Chat', icon: 'chat' },
    { path: '/user/cleaning', label: 'Cleaning', icon: 'cleaning_services' },
    { path: '/user/connect-db', label: 'Database', icon: 'storage' },
    { path: '/user/downloads', label: 'Downloads', icon: 'download' },
    { path: '/user/profile', label: 'Profile', icon: 'person' },
];

export default function UserLayout() {
    const { logout } = useAuthStore();
    const navigate = useNavigate();
    const location = useLocation();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    const linkClasses = (path: string) => {
        const active = location.pathname === path;
        return `
            flex items-center rounded-md transition-all duration-300 ease-in-out text-sm tracking-wide
            ${isCollapsed ? 'justify-center p-3' : 'px-3 py-2.5 gap-3'}
            ${active
                ? 'bg-primary/10 text-primary border-r-2 border-primary'
                : 'text-themed-muted hover:bg-primary/5 hover:text-themed-main'}
        `;
    };

    const spanClasses = `transition-all duration-500 ease-in-out origin-left whitespace-nowrap overflow-hidden ${isCollapsed ? 'max-w-0 opacity-0 scale-95 ml-0' : 'max-w-48 opacity-100 scale-100 ml-0'}`;

    const isActive = (path: string) => location.pathname === path;

    return (
        <div
            className="flex h-screen overflow-hidden font-serif selection:bg-primary selection:text-white transition-colors duration-300"
            style={{ background: 'var(--bg-main)', color: 'var(--text-main)' }}
        >
            {/* Sidebar */}
            <aside
                className={`
                    sidebar-themed flex flex-col h-screen transition-all duration-500 ease-in-out z-30 relative overflow-hidden border-r border-border-main/30 bg-bg-card
                    ${isCollapsed ? 'w-20' : 'w-64'}
                `}
            >
                <div className={`flex-1 flex flex-col min-h-0 transition-all duration-500 ${isCollapsed ? 'px-0 py-6' : 'p-6'}`}>
                    {/* Logo Section */}
                    <div className={`flex items-center mb-8 shrink-0 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                        <div className="flex items-center">
                            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-white shadow-[0_0_15px_rgba(108,99,255,0.2)]">
                                <span className="material-symbols-outlined text-[18px] leading-none">analytics</span>
                            </div>
                            <div className={`ml-3 transition-all duration-500 ease-in-out origin-left whitespace-nowrap overflow-hidden ${isCollapsed ? 'max-w-0 opacity-0' : 'max-w-48 opacity-100'}`}>
                                <p className="text-lg font-semibold tracking-wide leading-none text-themed-main">Vizzy</p>
                                <p className="text-[10px] uppercase tracking-[0.18em] text-themed-muted mt-1">Data Curator</p>
                            </div>
                        </div>
                        {/* Theme toggle inline when expanded */}
                        {!isCollapsed && (
                            <ThemeToggle size="sm" />
                        )}
                    </div>

                    {/* Navigation - Scrollable */}
                    <nav className={`flex-1 overflow-y-auto min-h-0 space-y-1.5 scrollbar-hide hover:scrollbar-default ${isCollapsed ? 'px-3' : 'px-0'}`}>
                        {NAV_ITEMS.map((item) => (
                            <Link
                                key={item.path}
                                to={item.path}
                                title={isCollapsed ? item.label : ''}
                                className={linkClasses(item.path)}
                                style={{ color: isActive(item.path) ? undefined : 'var(--text-sidebar)' }}
                            >
                                <span className="material-symbols-outlined text-[19px] leading-none flex-shrink-0">{item.icon}</span>
                                <span className={spanClasses}>{item.label}</span>
                            </Link>
                        ))}
                    </nav>
                </div>

                {/* Bottom: theme toggle (collapsed) + logout */}
                <div className={`shrink-0 transition-all duration-500 border-t border-border-main/20 ${isCollapsed ? 'px-2 py-4' : 'px-4 py-4'} space-y-1`}>
                    <Button
                        type="button"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className={`w-full flex items-center justify-start rounded-md text-sm text-themed-muted hover:bg-primary/5 hover:text-primary transition-all ${isCollapsed ? 'px-0 justify-center h-10' : 'px-3 py-2.5'}`}
                        variant="ghost"
                        title={isCollapsed ? 'Expand' : 'Collapse'}
                    >
                        <span className="material-symbols-outlined text-[19px] leading-none shrink-0" style={{ marginRight: isCollapsed ? '0' : '12px' }}>{isCollapsed ? 'menu' : 'menu_open'}</span>
                        <span className={spanClasses}>{isCollapsed ? 'Expand' : 'Collapse'}</span>
                    </Button>

                    {/* Theme toggle when sidebar is collapsed */}
                    {isCollapsed && (
                        <div className="flex justify-center py-2">
                            <ThemeToggle size="sm" />
                        </div>
                    )}
                    
                    <Button
                        type="button"
                        onClick={handleLogout}
                        title={isCollapsed ? 'Logout' : ''}
                        className={`
                            flex items-center justify-start rounded-md hover:bg-red-500/10 hover:text-red-500 border border-transparent transition-all duration-300 text-sm w-full
                            ${isCollapsed ? 'px-0 justify-center h-10' : 'px-3 py-2.5'}
                        `}
                        style={{ color: 'var(--text-muted)' }}
                        variant="ghost"
                    >
                        <span className="material-symbols-outlined text-[19px] leading-none shrink-0" style={{ marginRight: isCollapsed ? '0' : '12px' }}>logout</span>
                        <span className={spanClasses}>Logout</span>
                    </Button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden relative">
                <main
                    className="flex-1 flex flex-col overflow-y-auto custom-scrollbar relative z-10 w-full h-full transition-colors duration-300"
                    style={{ background: 'var(--bg-main)' }}
                >
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
