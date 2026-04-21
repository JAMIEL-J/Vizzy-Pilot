import React from 'react';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip as ChartTooltip, Legend as ChartLegend, Filler
} from 'chart.js';
import { Line, Pie } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, ChartTooltip, ChartLegend, Filler
);
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

// Mock data for charts
const userGrowthData = [
    { month: 'Jan', newUsers: 120, activeUsers: 80 },
    { month: 'Feb', newUsers: 190, activeUsers: 140 },
    { month: 'Mar', newUsers: 230, activeUsers: 180 },
    { month: 'Apr', newUsers: 280, activeUsers: 220 },
    { month: 'May', newUsers: 350, activeUsers: 280 },
    { month: 'Jun', newUsers: 420, activeUsers: 320 },
    { month: 'Jul', newUsers: 510, activeUsers: 380 },
];

const activityData = [
    { name: 'Uploads', value: 25, color: '#2962ff' },
    { name: 'Downloads', value: 20, color: '#00c2ff' },
    { name: 'Visualizations', value: 30, color: '#ff6b35' },
    { name: 'Chat Queries', value: 15, color: '#7c3aed' },
    { name: 'Dashboards', value: 10, color: '#22c55e' },
];

const recentUsers = [
    { name: 'John Smith', email: 'john@company.com', time: '2 min ago', color: 'from-blue-400 to-blue-600' },
    { name: 'Sarah Johnson', email: 'sarah@startup.io', time: '15 min ago', color: 'from-green-400 to-green-600' },
    { name: 'Mike Wilson', email: 'mike@enterprise.com', time: '1 hour ago', color: 'from-purple-400 to-purple-600' },
];

const recentActivity = [
    { user: 'John', action: 'uploaded', target: 'sales_q4.csv', time: '2 min ago', icon: 'upload', color: 'bg-blue-100 text-blue-600' },
    { user: 'Sarah', action: 'created a', target: 'bar chart', time: '5 min ago', icon: 'chart', color: 'bg-green-100 text-green-600' },
    { user: 'Mike', action: 'asked', target: '"What\'s the total revenue?"', time: '12 min ago', icon: 'chat', color: 'bg-purple-100 text-purple-600' },
];

// KPI Card Component
function KPICard({
    title,
    value,
    change,
    icon,
    iconBg,
    subtext
}: {
    title: string;
    value: string;
    change: string;
    icon: React.ReactNode;
    iconBg: string;
    subtext?: React.ReactNode;
}) {
    return (
        <div className="bg-white dark:bg-[#111827] rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-800 hover:shadow-md transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
                <div className={`p-3 ${iconBg} rounded-lg`}>
                    {icon}
                </div>
                <span className="text-xs font-semibold text-green-600 bg-green-100 dark:bg-green-900/20 px-2 py-1 rounded-full">
                    {change}
                </span>
            </div>
            <h3 className="text-gray-600 dark:text-gray-400 text-sm font-medium">{title}</h3>
            <p className="text-3xl font-bold text-navy dark:text-white mt-1">{value}</p>
            {subtext && (
                <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">{subtext}</div>
            )}
        </div>
    );
}

export default function AdminDashboard() {
    return (
        <div className="space-y-8">
            {/* KPI Cards Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KPICard
                    title="Total Users"
                    value="1,247"
                    change="+18%"
                    iconBg="bg-admin-purple/10"
                    icon={
                        <svg className="w-6 h-6 text-admin-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path>
                        </svg>
                    }
                    subtext={<><span className="text-green-600">+48 this week</span> · <span className="text-blue-600">+156 this month</span></>}
                />
                <KPICard
                    title="Active Users (Today)"
                    value="342"
                    change="+24%"
                    iconBg="bg-green-100"
                    icon={
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    }
                    subtext={<span className="text-admin-purple">27% of total users</span>}
                />
                <KPICard
                    title="Datasets Uploaded"
                    value="3,842"
                    change="+32%"
                    iconBg="bg-blue-100"
                    icon={
                        <svg className="w-6 h-6 text-primary-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path>
                        </svg>
                    }
                    subtext={<><span className="text-green-600">+89 this week</span> · <span className="text-blue-600">312 GB total</span></>}
                />
                <KPICard
                    title="Total Downloads"
                    value="8,456"
                    change="+15%"
                    iconBg="bg-cyan-100"
                    icon={
                        <svg className="w-6 h-6 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                        </svg>
                    }
                    subtext={<span className="text-green-600">+234 this week</span>}
                />
            </div>

            {/* KPI Cards Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KPICard
                    title="Visualizations Created"
                    value="12,847"
                    change="+42%"
                    iconBg="bg-orange-100"
                    icon={
                        <svg className="w-6 h-6 text-accent-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path>
                        </svg>
                    }
                />
                <KPICard
                    title="Dashboards Created"
                    value="1,562"
                    change="+28%"
                    iconBg="bg-pink-100"
                    icon={
                        <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"></path>
                        </svg>
                    }
                />
                <KPICard
                    title="AI Chat Queries"
                    value="45,231"
                    change="+56%"
                    iconBg="bg-indigo-100"
                    icon={
                        <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                        </svg>
                    }
                />
                <KPICard
                    title="External DB Connections"
                    value="287"
                    change="+12%"
                    iconBg="bg-teal-100"
                    icon={
                        <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"></path>
                        </svg>
                    }
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* User Growth Chart */}
                <div className="bg-white dark:bg-[#111827] rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-navy dark:text-white">User Growth</h3>
                        <div className="flex space-x-2">
                            <Button type="button" size="sm" className="px-3 py-1 text-xs bg-admin-purple text-white rounded-full">Monthly</Button>
                            <Button type="button" variant="ghost" size="sm" className="px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">Weekly</Button>
                        </div>
                    </div>
                    <div style={{ height: 250, width: '100%' }}>
                        <Line
                            data={{
                                labels: userGrowthData.map(d => d.month),
                                datasets: [{
                                    label: 'New Users',
                                    data: userGrowthData.map(d => d.newUsers),
                                    fill: true,
                                    backgroundColor: 'rgba(124, 58, 237, 0.2)',
                                    borderColor: '#7c3aed',
                                    tension: 0.4
                                },
                                {
                                    label: 'Active Users',
                                    data: userGrowthData.map(d => d.activeUsers),
                                    fill: true,
                                    backgroundColor: 'rgba(34, 197, 94, 0.2)',
                                    borderColor: '#22c55e',
                                    tension: 0.4
                                }]
                            }}
                            options={{ maintainAspectRatio: false }}
                        />
                    </div>
                </div>

                {/* Activity Distribution */}
                <div className="bg-white dark:bg-[#111827] rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-800">
                    <h3 className="text-lg font-bold text-navy dark:text-white mb-4">Platform Activity</h3>
                    <div style={{ height: 250, width: '100%' }}>
                        <Pie
                            data={{
                                labels: activityData.map(d => d.name),
                                datasets: [{
                                    data: activityData.map(d => d.value),
                                    backgroundColor: activityData.map(d => d.color),
                                }]
                            }}
                            options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }}
                        />
                    </div>
                </div>
            </div>

            {/* Recent Users & Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Users */}
                <div className="bg-white dark:bg-[#111827] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
                    <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                        <h3 className="text-lg font-bold text-navy dark:text-white">Recent Users</h3>
                        <Link to="/admin/users" className="text-sm text-admin-purple hover:underline">View All →</Link>
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-gray-800">
                        {recentUsers.map((user, index) => (
                            <div key={index} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                <div className="flex items-center space-x-3">
                                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${user.color} flex items-center justify-center text-white font-bold`}>
                                        {user.name[0]}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-navy dark:text-gray-200">{user.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
                                    </div>
                                </div>
                                <span className="text-xs text-gray-500 dark:text-gray-400">{user.time}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white dark:bg-[#111827] rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
                    <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                        <h3 className="text-lg font-bold text-navy dark:text-white">Recent Activity</h3>
                        <Link to="/admin/audit" className="text-sm text-admin-purple hover:underline">View All →</Link>
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-gray-800">
                        {recentActivity.map((activity, index) => (
                            <div key={index} className="p-4 flex items-center space-x-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                <div className={`w-8 h-8 rounded-full ${activity.color} flex items-center justify-center`}>
                                    {activity.icon === 'upload' && (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                                        </svg>
                                    )}
                                    {activity.icon === 'chart' && (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path>
                                        </svg>
                                    )}
                                    {activity.icon === 'chat' && (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                                        </svg>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm text-navy dark:text-gray-200">
                                        <span className="font-medium text-navy dark:text-gray-100">{activity.user}</span> {activity.action} <span className="font-medium text-navy dark:text-gray-100">{activity.target}</span>
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{activity.time}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
