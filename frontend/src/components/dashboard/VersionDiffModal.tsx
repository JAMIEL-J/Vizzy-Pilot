import React from 'react';

interface MappingItem {
    column_name: string;
    role: string;
}

interface VersionDiffModalProps {
    isOpen: boolean;
    onClose: () => void;
    previousMap: MappingItem[];
    currentMap: MappingItem[];
}

export default function VersionDiffModal({ isOpen, onClose, previousMap, currentMap }: VersionDiffModalProps) {
    if (!isOpen) return null;

    const diff = currentMap.filter(col => {
        const prev = previousMap.find(p => p.column_name === col.column_name);
        return prev && prev.role !== col.role;
    });

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <div className="bg-surface-container-lowest dark:bg-surface p-8 rounded-3xl shadow-2xl max-w-2xl w-full border border-outline-variant/20 dark:border-outline-variant/50 flex flex-col max-h-[80vh]">
                <div className="mb-6 flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-on-surface">Version Mapping Diff</h2>
                    <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                
                <p className="text-sm text-on-surface-variant mb-6">
                    Comparing the semantic mapping between the previous version and the current version.
                </p>

                <div className="flex-1 overflow-auto rounded-2xl border border-outline-variant/30 dark:border-outline-variant/20 bg-surface-container-highest/30 dark:bg-surface-container-lowest/30">
                    {diff.length > 0 ? (
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-surface-container-lowest dark:bg-surface z-10">
                                <tr className="text-xs font-bold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30">
                                    <th className="p-4">Column</th>
                                    <th className="p-4">Previous Role</th>
                                    <th className="p-4">Current Role</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/10">
                                {diff.map((col, idx) => {
                                    const prev = previousMap.find(p => p.column_name === col.column_name);
                                    return (
                                        <tr key={idx} className="hover:bg-surface-container-lowest dark:hover:bg-surface-container transition-colors">
                                            <td className="p-4 font-mono text-xs font-medium text-on-surface">{col.column_name}</td>
                                            <td className="p-4 text-xs text-red-500 font-semibold">{prev?.role}</td>
                                            <td className="p-4 text-xs text-green-500 font-semibold">{col.role}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <div className="p-10 text-center text-on-surface-variant italic">
                            No changes detected in semantic mappings between versions.
                        </div>
                    )}
                </div>

                <div className="mt-8 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2 bg-primary text-on-primary rounded-xl text-xs font-bold uppercase tracking-widest"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
