import { useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import ThemeToggle from '../ui/ThemeToggle';
import { Button } from '@/components/ui/button';

const navItems = [
    { path: '/admin', label: 'Dashboard', icon: 'dashboard' },
    { path: '/admin/users', label: 'User Management', icon: 'users' },
    { path: '/admin/datasets', label: 'All Datasets', icon: 'database' },
    { path: '/admin/analytics', label: 'Platform Analytics', icon: 'chart' },
    { path: '/admin/audit', label: 'Audit Logs', icon: 'clipboard' },
    { path: '/admin/settings', label: 'Settings', icon: 'settings' },
];

const icons: Record<string, React.JSX.Element> = {
    dashboard: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"></path>
        </svg>
    ),
    users: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
        </svg>
    ),
    database: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path>
        </svg>
    ),
    chart: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
        </svg>
    ),
    clipboard: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
        </svg>
    ),
    settings: (
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
        </svg>
    ),
};

export default function AdminLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleLogout = () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        navigate('/admin/login');
    };

    return (
        <div className="flex h-screen overflow-hidden font-serif transition-colors duration-300" style={{ background: 'var(--bg-main)', color: 'var(--text-main)' }}>
            {/* Sidebar */}
            <aside
                className={`
                    bg-gradient-to-b from-navy to-admin-blue text-white shrink-0 
                    transition-all duration-300 ease-in-out relative flex flex-col h-full
                    ${isCollapsed ? 'w-20' : 'w-64'}
                `}
            >
                {/* Fixed Toggle Button - Vertically Centered */}
                <Button
                    type="button"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute -right-3 top-1/2 -translate-y-1/2 bg-white text-navy rounded-full p-1.5 shadow-lg transition-all border border-gray-200 z-50 flex items-center justify-center group"
                    title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                    variant="ghost"
                    size="icon"
                >
                    <svg
                        className={`w-4 h-4 transition-transform duration-500 ${isCollapsed ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path>
                    </svg>
                </Button>

                <div className={`flex-1 flex flex-col transition-all duration-500 shrink-0 overflow-hidden ${isCollapsed ? 'px-0 py-6' : 'p-6'}`}>
                    {/* Logo Section */}
                    <div className={`flex items-center mb-8 shrink-0 transition-all duration-300 ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
                        <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0 shadow-inner group-hover:bg-white/30 transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                            </svg>
                        </div>
                        <span className={`text-xl font-bold transition-all duration-300 origin-left ${isCollapsed ? 'scale-0 w-0 opacity-0' : 'scale-100 opacity-100'}`}>
                            Vizzy Pilot
                        </span>
                    </div>

                    {/* Navigation - Scrollable Area */}
                    <div className={`flex-1 overflow-y-auto min-h-0 space-y-6 scrollbar-hide hover:scrollbar-default transition-all duration-500 ${isCollapsed ? 'px-3' : 'px-0'}`}>
                        {/* Admin Badge */}
                        <div className={`
                            flex items-center px-3 py-1.5 bg-admin-blue/30 rounded-full text-[10px] uppercase tracking-wider font-bold transition-all duration-300 shrink-0
                            ${isCollapsed ? 'opacity-0 -translate-x-10 pointer-events-none w-0 h-0 p-0 mb-0 overflow-hidden' : 'opacity-100 translate-x-0 w-max mb-8'}
                        `}>
                            <svg className="w-3 h-3 mr-1.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                            </svg>
                            <span className="whitespace-nowrap">Admin Panel</span>
                        </div>

                        <nav className="space-y-1.5">
                            {navItems.map((item) => {
                                const isActive = location.pathname === item.path;
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        title={isCollapsed ? item.label : ''}
                                        className={`
                                            flex items-center rounded-xl transition-all duration-300 group
                                            ${isCollapsed ? 'p-3 justify-center' : 'px-4 py-3 space-x-3'}
                                            ${isActive
                                                ? 'bg-white/20 text-white shadow-lg shadow-black/5 backdrop-blur-sm'
                                                : 'text-gray-300 hover:bg-white/10 hover:text-white'
                                            }
                                        `}
                                    >
                                        {icons[item.icon]}
                                        <span
                                            className={`
                                                font-medium whitespace-nowrap transition-all duration-300 origin-left
                                                ${isCollapsed ? 'scale-0 w-0 opacity-0' : 'scale-100 opacity-100'}
                                            `}
                                        >
                                            {item.label}
                                        </span>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
                {/* Header */}
                <header className="px-8 py-5 z-40 shadow-sm transition-colors duration-300 flex-shrink-0" style={{ background: 'var(--bg-header)', borderBottom: '1px solid var(--border-main)' }}>
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-navy dark:text-blue-400 tracking-tight">Admin Dashboard</h1>
                            <p className="text-gray-400 dark:text-gray-500 text-xs font-medium uppercase tracking-wider mt-0.5">Platform Intel</p>
                        </div>
                        <div className="flex items-center space-x-4">
                            <select className="px-4 py-2 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-admin-blue outline-none cursor-pointer transition-colors" style={{ background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border-main)' }}>
                                <option>Last 7 days</option>
                                <option>Last 30 days</option>
                                <option>Last 90 days</option>
                                <option>This Year</option>
                            </select>
                            <ThemeToggle size="sm" />
                            <div className="flex items-center space-x-3 pl-4" style={{ borderLeft: '1px solid var(--border-main)' }}>
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-admin-blue to-primary-blue flex items-center justify-center text-white font-bold shadow-md transform hover:rotate-6 transition-transform">
                                    A
                                </div>
                                <div className="hidden lg:block text-right">
                                    <p className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>Admin User</p>
                                    <p className="text-[10px] font-bold text-admin-blue uppercase tracking-tighter">Super Admin</p>
                                </div>
                                <Button
                                    type="button"
                                    onClick={handleLogout}
                                    className="ml-4 px-4 py-2 text-sm font-bold hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                    style={{ color: 'var(--text-muted)' }}
                                    variant="ghost"
                                >
                                    Log out
                                </Button>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 overflow-y-auto p-10 transition-colors duration-300 custom-scrollbar" style={{ background: 'var(--bg-main)' }}>
                    <div className="max-w-7xl mx-auto">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}


