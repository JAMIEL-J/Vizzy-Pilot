import { useState, useEffect } from 'react';
import { semanticMappingService } from '../../lib/api/dataset';

type ImpactSeverity = 'x_axis_changes' | 'y_axis_changes' | 'groupby_changes';

interface AffectedChart {
    chart_id: string;
    chart_title: string;
    impact: ImpactSeverity;
}

interface RemapModalProps {
    datasetId: string;
    versionId: string;
    currentMappings: Record<string, string>;
    onConfirm: (newMappings: Record<string, string>) => void;
    onCancel: () => void;
}

export default function RemapModal({ datasetId, versionId, currentMappings, onConfirm, onCancel }: RemapModalProps) {
    const [proposedMappings] = useState<Record<string, string>>(currentMappings);
    const [previewData, setPreviewData] = useState<{ affected_charts: AffectedChart[], manually_customized_charts: string[] } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleMappingChange = () => {
            previewImpact();
        };
        // This is a bit hacky, but we'll use a debounced effect or similar in a real app
        // For now, we'll trigger preview on every change
        handleMappingChange();
    }, [proposedMappings]);

    const previewImpact = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await semanticMappingService.previewRemap(datasetId, versionId, proposedMappings);
            setPreviewData(data);
        } catch (err: any) {
            console.error('Failed to preview remap:', err);
            setError(err?.response?.data?.detail || err?.message || 'Failed to preview impact');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirm = async () => {
        setIsConfirming(true);
            try {
            await semanticMappingService.remapMapping(datasetId, versionId, proposedMappings);
            onConfirm(proposedMappings);
        } catch (err: any) {
            console.error('Failed to confirm remap:', err);
            setError(err?.response?.data?.detail || err?.message || 'Failed to confirm remap');
        } finally {
            setIsConfirming(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <div className="bg-surface-container-lowest dark:bg-surface p-8 rounded-3xl shadow-2xl max-w-2xl w-full border border-outline-variant/20 dark:border-outline-variant/50 flex flex-col max-h-[80vh]">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-on-surface mb-2">Confirm Remapping</h2>
                    <p className="text-sm text-on-surface-variant">
                        Review the changes to your semantic mapping. This will create a new version of your dataset.
                    </p>
                </div>

                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <span className="material-symbols-outlined text-4xl animate-spin text-primary">sync</span>
                    </div>
                ) : error ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <span className="material-symbols-outlined text-red-500 text-4xl mb-4">error</span>
                        <p className="text-sm text-red-500 mb-6">{error}</p>
                        <button 
                            onClick={() => previewImpact()}
                            className="px-6 py-2 bg-primary text-white rounded-xl text-sm font-bold uppercase tracking-widest"
                        >
                            Retry
                        </button>
                    </div>
                ) : previewData ? (
                    <div className="flex-1 overflow-auto">
                        <div className="space-y-6">
                            <section>
                                <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3">Affected Charts</h3>
                                {previewData.affected_charts.length > 0 ? (
                                    <div className="space-y-2">
                                        {previewData.affected_charts.map(chart => (
                                            <div key={chart.chart_id} className="flex items-center justify-between p-3 bg-surface-container-high rounded-xl border border-outline-variant/10">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-on-surface">{chart.chart_title}</span>
                                                    <span className={`text-[10px] font-bold uppercase tracking-tighter ${
                                                        chart.impact === 'x_axis_changes' ? 'text-blue-500' :
                                                        chart.impact === 'y_axis_changes' ? 'text-green-500' :
                                                        'text-amber-500'
                                                    }`}>
                                                        {chart.impact.replace('_', ' ')}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-on-surface-variant italic">No charts will be affected by this change.</p>
                                )}
                            </section>

                             {previewData.manually_customized_charts.length > 0 && (
                                 <section>
                                     <div className="flex items-center gap-2 mb-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700/50 rounded-xl">
                                         <span className="material-symbols-outlined text-yellow-600 dark:text-yellow-500 text-lg">warning</span>
                                         <p className="text-xs font-bold text-yellow-800 dark:text-yellow-200">
                                             Your manual customizations to these charts will be reset.
                                         </p>
                                     </div>
                                     <div className="flex flex-wrap gap-2">
                                         {previewData.manually_customized_charts.map(id => (
                                             <span key={id} className="px-3 py-1 bg-surface-container-high rounded-full text-[10px] font-bold text-on-surface-variant border border-outline-variant/10">
                                                 Chart {id.slice(0, 8)}
                                             </span>
                                         ))}
                                     </div>
                                 </section>
                             )}

                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-on-surface-variant italic">
                        No changes detected.
                    </div>
                )}

                <div className="mt-8 flex items-center justify-end gap-3">
                    <button
                        onClick={onCancel}
                        disabled={isConfirming}
                        className="px-6 py-3 text-sm font-bold uppercase tracking-widest text-on-surface hover:bg-surface-container transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isConfirming || !previewData}
                        className={`px-10 py-3 text-sm font-bold uppercase tracking-wided rounded-2xl shadow-xl transition-all ${
                            isConfirming || !previewData
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-primary text-on-primary shadow-primary/30 hover:brightness-110 hover:scale-[1.02]'
                        }`}
                    >
                        {isConfirming ? 'Confirming...' : 'Confirm Re-map'}
                    </button>
                </div>
            </div>
        </div>
    );
}
