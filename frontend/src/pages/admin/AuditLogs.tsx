import { useState } from 'react';
import { Button } from '@/components/ui/button';

// Mock data for audit logs
const mockLogs = [
    { id: '1', user: 'John Smith', email: 'john@company.com', action: 'dataset.upload', target: 'sales_q4_2025.csv', ip: '192.168.1.100', timestamp: '2026-02-04 14:23:45' },
    { id: '2', user: 'Sarah Johnson', email: 'sarah@startup.io', action: 'visualization.create', target: 'Monthly Sales Chart', ip: '10.0.0.52', timestamp: '2026-02-04 14:18:32' },
    { id: '3', user: 'Mike Wilson', email: 'mike@enterprise.com', action: 'chat.query', target: 'Show total revenue by region', ip: '172.16.0.15', timestamp: '2026-02-04 14:12:18' },
    { id: '4', user: 'Emily Davis', email: 'emily@tech.co', action: 'user.login', target: 'Web Portal', ip: '192.168.1.205', timestamp: '2026-02-04 14:05:00' },
    { id: '5', user: 'David Brown', email: 'david@analytics.com', action: 'dataset.download', target: 'customer_data.xlsx', ip: '10.0.0.89', timestamp: '2026-02-04 13:58:22' },
    { id: '6', user: 'Lisa Anderson', email: 'lisa@data.io', action: 'user.logout', target: 'Web Portal', ip: '172.16.0.42', timestamp: '2026-02-04 13:45:10' },
    { id: '7', user: 'Admin User', email: 'admin@vizzy.com', action: 'admin.user_deactivate', target: 'test@example.com', ip: '192.168.1.1', timestamp: '2026-02-04 13:30:55' },
    { id: '8', user: 'John Smith', email: 'john@company.com', action: 'dashboard.create', target: 'Q4 Analytics Dashboard', ip: '192.168.1.100', timestamp: '2026-02-04 13:20:00' },
];

const actionLabels: Record<string, { label: string; color: string }> = {
    'dataset.upload': { label: 'Dataset Upload', color: 'bg-blue-100 text-blue-800' },
    'dataset.download': { label: 'Dataset Download', color: 'bg-cyan-100 text-cyan-800' },
    'visualization.create': { label: 'Visualization Created', color: 'bg-green-100 text-green-800' },
    'dashboard.create': { label: 'Dashboard Created', color: 'bg-blue-100 text-blue-800' },
    'chat.query': { label: 'Chat Query', color: 'bg-indigo-100 text-indigo-800' },
    'user.login': { label: 'User Login', color: 'bg-gray-100 text-gray-800' },
    'user.logout': { label: 'User Logout', color: 'bg-gray-100 text-gray-600' },
    'admin.user_deactivate': { label: 'User Deactivated', color: 'bg-red-100 text-red-800' },
};

export default function AuditLogs() {
    const [searchQuery, setSearchQuery] = useState('');
    const [actionFilter, setActionFilter] = useState('all');

    const filteredLogs = mockLogs.filter(log => {
        const matchesSearch = log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.target.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.email.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesAction = actionFilter === 'all' || log.action.startsWith(actionFilter);
        return matchesSearch && matchesAction;
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-navy dark:text-white">Audit Logs</h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Track all user activities and system events</p>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-[#111827] rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 transition-colors">
                <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                            </svg>
                            <input
                                type="text"
                                placeholder="Search by user, email, or target..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-admin-blue focus:border-transparent outline-none transition-colors"
                            />
                        </div>
                    </div>
                    <select
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111827] text-gray-700 dark:text-gray-300 rounded-lg focus:ring-2 focus:ring-admin-blue outline-none transition-colors"
                    >
                        <option value="all">All Actions</option>
                        <option value="dataset">Dataset Actions</option>
                        <option value="visualization">Visualization Actions</option>
                        <option value="dashboard">Dashboard Actions</option>
                        <option value="chat">Chat Queries</option>
                        <option value="user">User Activity</option>
                        <option value="admin">Admin Actions</option>
                    </select>
                    <input
                        type="date"
                        className="px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111827] text-gray-700 dark:text-gray-300 rounded-lg focus:ring-2 focus:ring-admin-blue outline-none transition-colors"
                    />
                    <Button type="button" className="px-4 py-2 bg-admin-blue text-white rounded-lg hover:bg-admin-blue/90 transition flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                        </svg>
                        Export Logs
                    </Button>
                </div>
            </div>

            {/* Logs Table */}
            <div className="bg-white dark:bg-[#111827] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-colors">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-[#1C1F26] border-b border-gray-200 dark:border-gray-800">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Timestamp</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">User</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Action</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Target</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">IP Address</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                            {filteredLogs.map((log) => {
                                const actionInfo = actionLabels[log.action] || { label: log.action, color: 'bg-gray-100 text-gray-800' };
                                return (
                                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                            {log.timestamp}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div>
                                                <p className="text-sm font-medium text-navy dark:text-white">{log.user}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{log.email}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${actionInfo.color}`}>
                                                {actionInfo.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate" title={log.target}>
                                            {log.target}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 font-mono">
                                            {log.ip}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Showing <span className="font-medium">{filteredLogs.length}</span> of <span className="font-medium">1,247</span> logs
                    </p>
                    <div className="flex items-center space-x-2">
                        <Button type="button" variant="outline" size="sm" className="px-3 py-1 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors" disabled>
                            Previous
                        </Button>
                        <Button type="button" size="sm" className="px-3 py-1 bg-admin-blue text-white rounded-lg text-sm">1</Button>
                        <Button type="button" variant="outline" size="sm" className="px-3 py-1 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">2</Button>
                        <Button type="button" variant="outline" size="sm" className="px-3 py-1 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">3</Button>
                        <span className="text-gray-500 dark:text-gray-500">...</span>
                        <Button type="button" variant="outline" size="sm" className="px-3 py-1 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">124</Button>
                        <Button type="button" variant="outline" size="sm" className="px-3 py-1 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            Next
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
