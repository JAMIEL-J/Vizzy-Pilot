import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip as ChartTooltip, Legend as ChartLegend, Filler
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, ChartTooltip, ChartLegend, Filler
);

// Mock data
const dailyActiveUsers = [
    { date: 'Mon', users: 245 },
    { date: 'Tue', users: 312 },
    { date: 'Wed', users: 289 },
    { date: 'Thu', users: 356 },
    { date: 'Fri', users: 401 },
    { date: 'Sat', users: 198 },
    { date: 'Sun', users: 176 },
];

const queryTypes = [
    { type: 'Visualizations', count: 1234, color: '#7c3aed' }, // Purple
    { type: 'Data Queries', count: 987, color: '#2962ff' },    // Blue
    { type: 'Exports', count: 654, color: '#00c2ff' },         // Cyan
    { type: 'Imports', count: 432, color: '#22c55e' },         // Green
    { type: 'API Calls', count: 876, color: '#ff6b35' },       // Orange
];

const storageUsage = [
    { month: 'Jan', storage: 45 },
    { month: 'Feb', storage: 62 },
    { month: 'Mar', storage: 89 },
    { month: 'Apr', storage: 124 },
    { month: 'May', storage: 178 },
    { month: 'Jun', storage: 234 },
    { month: 'Jul', storage: 312 },
];

export default function AdminAnalytics() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-navy">Platform Analytics</h2>
                <p className="text-gray-600 text-sm">Detailed platform usage statistics</p>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                    <p className="text-gray-600 text-sm">Avg Session Duration</p>
                    <p className="text-2xl font-bold text-navy">14m 32s</p>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                    <p className="text-gray-600 text-sm">Bounce Rate</p>
                    <p className="text-2xl font-bold text-navy">24.5%</p>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                    <p className="text-gray-600 text-sm">API Requests/Day</p>
                    <p className="text-2xl font-bold text-navy">45.2K</p>
                </div>
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                    <p className="text-gray-600 text-sm">Error Rate</p>
                    <p className="text-2xl font-bold text-green-600">0.12%</p>
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Daily Active Users */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                    <h3 className="text-lg font-bold text-navy mb-4">Daily Active Users</h3>
                    <div style={{ height: 250, width: '100%' }}>
                        <Line
                            data={{
                                labels: dailyActiveUsers.map(d => d.date),
                                datasets: [{
                                    label: 'Users',
                                    data: dailyActiveUsers.map(d => d.users),
                                    fill: true,
                                    backgroundColor: 'rgba(124, 58, 237, 0.2)',
                                    borderColor: '#7c3aed',
                                    tension: 0.4
                                }]
                            }}
                            options={{ maintainAspectRatio: false }}
                        />
                    </div>
                </div>

                {/* Query Types */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                    <h3 className="text-lg font-bold text-navy mb-4">Query Types Distribution</h3>
                    <div style={{ height: 250, width: '100%' }}>
                        <Bar
                            data={{
                                labels: queryTypes.map(d => d.type),
                                datasets: [{
                                    label: 'Count',
                                    data: queryTypes.map(d => d.count),
                                    backgroundColor: queryTypes.map(d => d.color),
                                    borderRadius: 4
                                }]
                            }}
                            options={{ maintainAspectRatio: false }}
                        />
                    </div>
                </div>
            </div>

            {/* Storage Usage */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-navy mb-4">Storage Usage (GB)</h3>
                <div style={{ height: 250, width: '100%' }}>
                    <Line
                        data={{
                            labels: storageUsage.map(d => d.month),
                            datasets: [{
                                label: 'Storage (GB)',
                                data: storageUsage.map(d => d.storage),
                                borderColor: '#ff6b35',
                                backgroundColor: '#fff',
                                pointBackgroundColor: '#fff',
                                pointBorderColor: '#ff6b35',
                                pointRadius: 4,
                                pointHoverRadius: 6
                            }]
                        }}
                        options={{ maintainAspectRatio: false }}
                    />
                </div>
            </div>
        </div>
    );
}
