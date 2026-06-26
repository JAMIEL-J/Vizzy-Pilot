import { useState } from 'react';
import { Button } from '@/components/ui/button';

// Mock data for datasets
const mockDatasets = [
    { id: '1', name: 'sales_q4_2025.csv', owner: 'John Smith', ownerEmail: 'john@company.com', size: '2.4 MB', rows: 15420, status: 'active', createdAt: 'Jan 15, 2026' },
    { id: '2', name: 'customer_data.xlsx', owner: 'Sarah Johnson', ownerEmail: 'sarah@startup.io', size: '1.8 MB', rows: 8932, status: 'active', createdAt: 'Feb 3, 2026' },
    { id: '3', name: 'inventory_report.csv', owner: 'Mike Wilson', ownerEmail: 'mike@enterprise.com', size: '856 KB', rows: 4521, status: 'processing', createdAt: 'Feb 4, 2026' },
    { id: '4', name: 'marketing_analytics.csv', owner: 'Emily Davis', ownerEmail: 'emily@tech.co', size: '5.2 MB', rows: 28340, status: 'active', createdAt: 'Jan 28, 2026' },
    { id: '5', name: 'user_behavior.json', owner: 'David Brown', ownerEmail: 'david@analytics.com', size: '3.1 MB', rows: 19200, status: 'active', createdAt: 'Jan 20, 2026' },
    { id: '6', name: 'financial_data_2025.csv', owner: 'Lisa Anderson', ownerEmail: 'lisa@data.io', size: '12.5 MB', rows: 82450, status: 'error', createdAt: 'Dec 15, 2025' },
];

export default function AdminDatasets() {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const filteredDatasets = mockDatasets.filter(dataset => {
        const matchesSearch = dataset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            dataset.owner.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || dataset.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>;
            case 'processing':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Processing</span>;
            case 'error':
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Error</span>;
            default:
                return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-navy dark:text-white">All Datasets</h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">View and manage all uploaded datasets across the platform</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-[#111827] rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 transition-colors">
                    <p className="text-gray-600 dark:text-gray-400 text-sm">Total Datasets</p>
                    <p className="text-2xl font-bold text-navy dark:text-white">3,842</p>
                </div>
                <div className="bg-white dark:bg-[#111827] rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 transition-colors">
                    <p className="text-gray-600 dark:text-gray-400 text-sm">Total Storage</p>
                    <p className="text-2xl font-bold text-navy dark:text-white">312 GB</p>
                </div>
                <div className="bg-white dark:bg-[#111827] rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 transition-colors">
                    <p className="text-gray-600 dark:text-gray-400 text-sm">Active</p>
                    <p className="text-2xl font-bold text-green-600">3,756</p>
                </div>
                <div className="bg-white dark:bg-[#111827] rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-800 transition-colors">
                    <p className="text-gray-600 dark:text-gray-400 text-sm">Errors</p>
                    <p className="text-2xl font-bold text-red-600">12</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                            </svg>
                            <input
                                type="text"
                                placeholder="Search datasets or owners..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-admin-blue focus:border-transparent outline-none transition-colors"
                            />
                        </div>
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111827] text-gray-700 dark:text-gray-300 rounded-lg focus:ring-2 focus:ring-admin-blue outline-none transition-colors"
                    >
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="processing">Processing</option>
                        <option value="error">Error</option>
                    </select>
                </div>
            </div>

            {/* Datasets Table */}
            <div className="bg-white dark:bg-[#111827] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-colors">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-[#1C1F26] border-b border-gray-200 dark:border-gray-800">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Dataset</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Owner</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Size</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Rows</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Created</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                            {filteredDatasets.map((dataset) => (
                                <tr key={dataset.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                                <svg className="w-5 h-5 text-primary-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                                </svg>
                                            </div>
                                            <span className="text-sm font-medium text-navy dark:text-white">{dataset.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div>
                                            <p className="text-sm font-medium text-navy dark:text-white">{dataset.owner}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{dataset.ownerEmail}</p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{dataset.size}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{dataset.rows.toLocaleString()}</td>
                                    <td className="px-6 py-4">{getStatusBadge(dataset.status)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{dataset.createdAt}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end space-x-2">
                                            <Button type="button" variant="ghost" size="icon" className="p-2 text-gray-500 hover:text-admin-blue hover:bg-admin-blue/10 rounded-lg transition" title="View">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                                                </svg>
                                            </Button>
                                            <Button type="button" variant="ghost" size="icon" className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Download">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                                                </svg>
                                            </Button>
                                            <Button type="button" variant="ghost" size="icon" className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                                </svg>
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
