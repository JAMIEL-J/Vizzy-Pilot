import React from 'react';
import { X, Sparkles, ArrowRight } from 'lucide-react';
import { PanelHeader, BtnAccent } from '@/components/ui/primitive';

interface InsightModalProps {
    isOpen: boolean;
    onClose: () => void;
    isLoading: boolean;
    narrative: string | null;
    onDeepDive: () => void;
}

export const InsightModal: React.FC<InsightModalProps> = ({
    isOpen,
    onClose,
    isLoading,
    narrative,
    onDeepDive
}) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="flex w-full max-w-3xl max-h-[85vh] flex-col bg-surface rounded-3xl shadow-2xl border border-border overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <PanelHeader
                    title="Dashboard Insight"
                    subtitle="AI-driven summary of your current data"
                    actions={
                        <button
                            onClick={onClose}
                            className="rounded-full p-1.5 hover:bg-surface-2 transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    }
                />

                <div className="flex-1 overflow-auto p-8">
                    {isLoading ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-6 py-12">
                            <div className="relative">
                                <Sparkles className="h-12 w-12 text-primary animate-pulse" />
                                <div className="absolute inset-0 blur-xl bg-primary/30 animate-pulse" />
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-lg font-semibold text-foreground">Analyzing your data...</h4>
                                <p className="text-sm text-muted-foreground max-w-xs">
                                    Vizzy Pilot is scanning your KPIs and charts to find the most meaningful insights.
                                </p>
                            </div>
                            <div className="w-48 h-1 bg-surface-2 rounded-full overflow-hidden">
                                <div className="h-full bg-primary animate-progress" style={{ width: '60%' }} />
                            </div>
                        </div>
                    ) : narrative ? (
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 text-primary font-semibold text-sm mb-4">
                                <Sparkles className="h-4 w-4" />
                                <span>Key Findings</span>
                            </div>
                            <div className="text-foreground leading-relaxed text-[15px] whitespace-pre-wrap font-serif">
                                {narrative}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-12">
                            <p className="text-muted-foreground italic">No insight generated yet. Try clicking the button again.</p>
                        </div>
                    )}
                </div>

                {!isLoading && narrative && (
                    <div className="p-6 border-t border-border bg-surface-2/30 flex justify-end">
                        <BtnAccent onClick={onDeepDive} className="group">
                            Deep Dive with Vizzy Pilot
                            <ArrowRight className="h-3.5 w-3.5 ml-2 transition-transform group-hover:translate-x-1" />
                        </BtnAccent>
                    </div>
                )}
            </div>
        </div>
    );
};
