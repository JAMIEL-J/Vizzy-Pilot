import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { datasetService, type Dataset, type DuckDBStatus } from '../../lib/api/dataset';

export default function DatasetList() {
    const [searchTerm, setSearchTerm] = useState('');
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isMetricsLoading, setIsMetricsLoading] = useState(false);
    const [rowCountByDataset, setRowCountByDataset] = useState<Record<string, number>>({});
    const [syncStatusByDataset, setSyncStatusByDataset] = useState<Record<string, DuckDBStatus['status']>>({});

    useEffect(() => {
        loadDatasets();
    }, []);

    const loadDatasets = async () => {
        try {
            const data = await datasetService.listDatasets();
            setDatasets(data);
            await loadDatasetMetrics(data);
        } catch (error) {
            console.error('Failed to load datasets:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadDatasetMetrics = async (datasetList: Dataset[]) => {
        if (datasetList.length === 0) {
            setRowCountByDataset({});
            setSyncStatusByDataset({});
            return;
        }

        setIsMetricsLoading(true);
        try {
            const rowsMap: Record<string, number> = {};
            const statusMap: Record<string, DuckDBStatus['status']> = {};

            const results = await Promise.all(
                datasetList.map(async (dataset) => {
                    const [latestVersionResult, duckdbStatusResult] = await Promise.allSettled([
                        datasetService.getLatestVersion(dataset.id),
                        datasetService.getDuckdbStatus(dataset.id),
                    ]);

                    let rowCount = 0;
                    if (latestVersionResult.status === 'fulfilled') {
                        const rawRowCount = Number(latestVersionResult.value?.row_count ?? 0);
                        rowCount = Number.isFinite(rawRowCount) ? Math.max(0, rawRowCount) : 0;
                    }

                    const syncStatus = duckdbStatusResult.status === 'fulfilled'
                        ? duckdbStatusResult.value?.status || 'unknown'
                        : 'unknown';

                    return {
                        datasetId: dataset.id,
                        rowCount,
                        syncStatus,
                    };
                })
            );

            for (const item of results) {
                rowsMap[item.datasetId] = item.rowCount;
                statusMap[item.datasetId] = item.syncStatus;
            }

            setRowCountByDataset(rowsMap);
            setSyncStatusByDataset(statusMap);
        } catch (error) {
            console.error('Failed to load dataset metrics:', error);
        } finally {
            setIsMetricsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this dataset?')) {
            try {
                await datasetService.deleteDataset(id);
                setDatasets(datasets.filter(d => d.id !== id));
            } catch (error) {
                console.error('Failed to delete dataset:', error);
                alert('Failed to delete dataset');
            }
        }
    };

    const filteredDatasets = datasets.filter(d =>
        d.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredDatasetIds = useMemo(() => new Set(filteredDatasets.map((d) => d.id)), [filteredDatasets]);

    const totalRowsAnalyzed = useMemo(() => {
        return Object.entries(rowCountByDataset)
            .filter(([datasetId]) => filteredDatasetIds.has(datasetId))
            .reduce((acc, [, count]) => acc + count, 0);
    }, [rowCountByDataset, filteredDatasetIds]);

    const activeFilteredCount = useMemo(
        () => filteredDatasets.filter((d) => d.is_active).length,
        [filteredDatasets]
    );

    const syncedActiveFilteredCount = useMemo(
        () => filteredDatasets.filter((d) => d.is_active && syncStatusByDataset[d.id] === 'ready').length,
        [filteredDatasets, syncStatusByDataset]
    );

    const syncProgressPct = activeFilteredCount > 0
        ? Math.round((syncedActiveFilteredCount / activeFilteredCount) * 100)
        : 0;

    const healthyFilteredCount = useMemo(
        () => filteredDatasets.filter((d) => {
            const status = (syncStatusByDataset[d.id] || 'unknown').toLowerCase();
            return status === 'ready' || status === 'building';
        }).length,
        [filteredDatasets, syncStatusByDataset]
    );

    const systemHealthPct = filteredDatasets.length > 0
        ? Number(((healthyFilteredCount / filteredDatasets.length) * 100).toFixed(1))
        : 0;

    const latestRefreshLabel = useMemo(() => {
        if (filteredDatasets.length === 0) return 'No datasets available';
        const latestTimestamp = filteredDatasets
            .map((d) => Date.parse(d.updated_at || d.created_at || ''))
            .filter((n) => Number.isFinite(n))
            .reduce((max, n) => Math.max(max, n), 0);
        if (!latestTimestamp) return 'Update time unavailable';

        const elapsedMs = Date.now() - latestTimestamp;
        if (elapsedMs < 60_000) return 'Updated just now';
        if (elapsedMs < 3_600_000) return `Updated ${Math.floor(elapsedMs / 60_000)}m ago`;
        if (elapsedMs < 86_400_000) return `Updated ${Math.floor(elapsedMs / 3_600_000)}h ago`;
        return `Updated ${Math.floor(elapsedMs / 86_400_000)}d ago`;
    }, [filteredDatasets]);

    return (
        <main className="flex-1 flex flex-col min-w-0 bg-background relative selection:bg-primary selection:text-white">
            <div className="p-8 max-w-7xl mx-auto w-full">
                {/* Page Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h2 className="text-3xl font-bold font-headline text-on-surface tracking-tight">Dataset Management</h2>
                        <p className="text-on-surface-variant mt-1 font-body">Manage and curate your repository of {datasets.length} curated data sources.</p>
                    </div>
                    <Link to="/user/upload" className="bg-primary text-on-primary px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-primary/20">
                        <span className="material-symbols-outlined text-lg">add_circle</span>
                        <span>Upload New Dataset</span>
                    </Link>
                </div>

                {/* Search & Filter Bar */}
                <div className="flex flex-wrap items-center gap-4 p-4 bg-surface-container-lowest dark:bg-surface-container rounded-xl shadow-sm mb-6 border border-outline-variant/10">
                    <div className="flex-1 min-w-[280px]">
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant dark:text-on-surface-variant">search</span>
                            <input
                                className="w-full pl-10 pr-4 py-2.5 bg-background border border-outline-variant/30 dark:border-outline-variant/20 rounded-lg text-on-surface focus:ring-2 focus:ring-primary/10 dark:focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                placeholder="Filter datasets by name, tags, or source..."
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" className="px-4 py-2.5 bg-background border border-outline-variant/30 dark:border-outline-variant/20 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-surface-container-low dark:hover:bg-surface-container-high text-on-surface transition-colors">
                            <span className="material-symbols-outlined text-sm">filter_list</span>
                            <span>Type: All</span>
                            <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
                        </button>
                        <button type="button" className="px-4 py-2.5 bg-background border border-outline-variant/30 dark:border-outline-variant/20 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-surface-container-low dark:hover:bg-surface-container-high text-on-surface transition-colors">
                            <span className="material-symbols-outlined text-sm">calendar_today</span>
                            <span>Sort: Recent</span>
                            <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
                        </button>
                    </div>
                </div>

                {/* Data Table Container */}
                <div className="bg-surface-container-lowest dark:bg-surface-container rounded-2xl overflow-hidden shadow-[0_12px_40px_rgba(20,27,44,0.03)] dark:shadow-2xl border border-outline-variant/10">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-surface-container-low dark:bg-surface-container-high border-b border-outline-variant/10">
                                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-label">Dataset Name</th>
                                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-label">Created At</th>
                                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-label">Status</th>
                                <th className="px-6 py-4 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/5">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-on-surface-variant text-xs tracking-widest uppercase">Loading datasets...</td>
                                </tr>
                            ) : filteredDatasets.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-on-surface-variant text-xs tracking-widest uppercase">No datasets found. Upload one to get started.</td>
                                </tr>
                            ) : (
                                filteredDatasets.map((dataset, index) => (
                                    <tr key={dataset.id} className={`group transition-colors ${index % 2 === 0 ? 'hover:bg-primary/5 dark:hover:bg-primary/5' : 'bg-surface-container-low/30 dark:bg-surface-container-high/20 hover:bg-primary/5 dark:hover:bg-primary/5'}`}>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                                    <span className="material-symbols-outlined">table_chart</span>
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-on-surface">{dataset.name}</p>
                                                    {dataset.description && <p className="text-xs text-on-surface-variant">{dataset.description}</p>}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-sm text-on-surface-variant">
                                            {dataset.created_at
                                                ? new Date(dataset.created_at.endsWith('Z') ? dataset.created_at : dataset.created_at + 'Z').toLocaleString('en-IN', {
                                                    timeZone: 'Asia/Kolkata',
                                                    year: 'numeric', month: 'short', day: '2-digit',
                                                    hour: '2-digit', minute: '2-digit', hour12: true
                                                })
                                                : '-'
                                            }
                                        </td>
                                        <td className="px-6 py-5">
                                            {dataset.is_active ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary/10 text-secondary">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-secondary mr-1.5"></span>
                                                    Active
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-outline-variant/30 text-on-surface-variant dark:text-on-surface-variant">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-outline-variant mr-1.5"></span>
                                                    Inactive
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Link to="/user/chat" className="p-2 hover:bg-primary/10 text-primary rounded-lg transition-colors" title="Deep Chat">
                                                    <span className="material-symbols-outlined">forum</span>
                                                </Link>
                                                <button type="button" onClick={() => handleDelete(dataset.id)} className="p-2 hover:bg-error/10 text-error rounded-lg transition-colors" title="Delete">
                                                    <span className="material-symbols-outlined">delete</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    
                    {/* Pagination Footer */}
                    <div className="px-6 py-4 bg-surface-container-low dark:bg-surface-container-high/40 border-t border-outline-variant/10 flex items-center justify-between">
                        <p className="text-xs text-on-surface-variant font-medium">Showing {filteredDatasets.length} datasets</p>
                        <div className="flex items-center gap-1">
                            <button className="p-1.5 rounded hover:bg-surface-container-highest transition-colors text-on-surface-variant">
                                <span className="material-symbols-outlined text-sm">chevron_left</span>
                            </button>
                            <button className="w-8 h-8 rounded bg-primary text-on-primary text-xs font-bold">1</button>
                            <button className="p-1.5 rounded hover:bg-surface-container-highest transition-colors text-on-surface-variant">
                                <span className="material-symbols-outlined text-sm">chevron_right</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Contextual Insight (Bento Element) */}
                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-primary hover:bg-primary-container text-on-primary rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden h-40 transition-colors shadow-lg shadow-primary/10 dark:shadow-primary/20">
                        <div className="relative z-10">
                            <p className="text-on-primary/70 text-xs font-bold uppercase tracking-widest mb-2 font-label">Total Elements Analyzed</p>
                            <h3 className="text-2xl font-bold font-headline">
                                {isMetricsLoading ? 'Calculating...' : `${totalRowsAnalyzed.toLocaleString()} Rows`}
                            </h3>
                        </div>
                        <div className="w-full bg-black/20 h-2 rounded-full overflow-hidden relative z-10">
                            <div className="bg-white h-full transition-all duration-500" style={{ width: `${syncProgressPct}%` }}></div>
                        </div>
                        {/* Decorative pattern */}
                        <div className="absolute -right-4 -bottom-4 opacity-10">
                            <span className="material-symbols-outlined text-9xl">table_chart</span>
                        </div>
                    </div>
                    <div className="bg-surface-container-low dark:bg-surface-container border border-outline-variant/20 dark:border-outline-variant/10 rounded-2xl p-6 flex flex-col justify-between h-40">
                        <div>
                            <p className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-2 font-label">Sync Status</p>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-secondary animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>sync</span>
                                <span className="text-lg font-bold text-on-surface">{syncedActiveFilteredCount} Synced actively</span>
                            </div>
                        </div>
                        <p className="text-sm text-on-surface-variant italic">{latestRefreshLabel}</p>
                    </div>
                    <div className="bg-surface-container-lowest dark:bg-surface-container border border-outline-variant/10 rounded-2xl p-6 flex flex-col justify-between h-40 shadow-sm">
                        <div>
                            <p className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-2 font-label">System Health</p>
                            <h3 className="text-2xl font-bold font-headline text-on-surface">{systemHealthPct.toFixed(1)}%</h3>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-secondary text-sm">check_circle</span>
                            <span className="text-xs text-secondary font-semibold">
                                {systemHealthPct >= 90 ? 'Active & performant' : systemHealthPct >= 60 ? 'Stable with pending sync' : 'Needs attention'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
