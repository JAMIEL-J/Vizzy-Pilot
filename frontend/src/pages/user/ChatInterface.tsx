import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { chatService, type ChatMessage, type ChatSession } from '../../lib/api/chat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { datasetService, type Dataset } from '../../lib/api/dataset';
import ChartRenderer from '../../components/chat/ChartRenderer';
import { ShiningText } from '../../components/ui/shining-text';
import { Button } from '@/components/ui/button';
import { AIInput } from '@/components/ui/ai-input';
import RuixenMoonChat from '../../components/ui/ruixen-moon-chat';
import { PanelRightClose, Download, Copy, Maximize2 } from 'lucide-react';

// Removed escapeRegExp unused
const buildClarifiedQuery = (originalQuery: string, term: string, selectedColumn: string) => {
    const source = (originalQuery || '').trim();
    if (!source) {
        return `Use column ${selectedColumn}`;
    }

    if (!term) {
        return `${source}. Use column ${selectedColumn}.`;
    }

    // Simplest reliable clarification: append instructions directly to avoid syntax bugs 
    // or word duplication (like "churn Churn" seen when replacing inline words).
    return `${source}. Use column "${selectedColumn}" for ${term}.`;
};

const isInsightMessage = (msg: ChatMessage) => {
    const contentType = msg.output_data?.type;
    return msg.intent_type === 'interpretive' || contentType === 'interpretive_text' || contentType === 'interpretive';
};

const hasRenderableOutput = (outputData: any) => {
    if (!outputData || outputData.type === 'clarification') {
        return false;
    }

    if (outputData.type === 'kpi') {
        return true;
    }

    if (outputData.type === 'nl2sql') {
        if (outputData.chart?.type === 'kpi') {
            return true;
        }

        if (outputData.response_type === 'text') {
            return false;
        }

        return Boolean(outputData.chart);
    }

    if (outputData.response_type === 'text') {
        return false;
    }

    return Boolean(outputData.chart || outputData.data);
};

const isMultiMetricKPIMessage = (msg: ChatMessage) => {
    const outputData = msg.output_data;
    if (!outputData) return false;

    const chartPayload = outputData.type === 'nl2sql' ? outputData.chart : outputData;
    const metrics = chartPayload?.data?.metrics;

    return chartPayload?.type === 'kpi' && Array.isArray(metrics) && metrics.length > 1;
};

const isKPIMessage = (msg: ChatMessage) => {
    const outputData = msg.output_data;
    if (!outputData) return false;

    const chartPayload = outputData.type === 'nl2sql' ? outputData.chart : outputData;
    return chartPayload?.type === 'kpi';
};

const getArtifactPreviewBars = (targetData: any) => {
    const fallback: number[] = [80, 64, 52];
    const rows = Array.isArray(targetData?.data?.rows) ? targetData.data.rows : [];

    if (rows.length > 0) {
        const first = rows[0] as Record<string, unknown>;
        const valueKey = Object.keys(first).find((key) => typeof first[key] === 'number');
        if (valueKey) {
            const values = rows
                .slice(0, 4)
                .map((row: Record<string, unknown>) => Number(row[valueKey]))
                .filter((v: number) => Number.isFinite(v));

            if (values.length > 0) {
                const max = Math.max(...values, 1);
                return values.map((value: number) => Math.max(24, Math.round((value / max) * 100)));
            }
        }
    }

    return fallback;
};

interface InsightSqlQuery {
    id: string;
    title: string;
    sql: string;
    dimension?: string;
    row_count?: number;
}

const getInsightSqlQueries = (msg: ChatMessage): InsightSqlQuery[] => {
    const outputData = msg.output_data;
    if (!outputData || typeof outputData !== 'object') {
        return [];
    }

    const candidatesRaw = Array.isArray(outputData.diagnostic_sql_queries)
        ? outputData.diagnostic_sql_queries
        : (Array.isArray(outputData.diagnostics) ? outputData.diagnostics : []);
    const candidates: unknown[] = candidatesRaw;
    const sqlQueries: InsightSqlQuery[] = [];
    
    // Also include the primary SQL if it exists
    if ('sql' in outputData && typeof outputData.sql === 'string' && outputData.sql.trim()) {
        sqlQueries.push({
            id: 'primary',
            title: 'Generated SQL',
            sql: outputData.sql.trim()
        });
    }

    candidates.forEach((item, idx) => {
        if (!item || typeof item !== 'object') {
            return;
        }

        const typedItem = item as Record<string, any>;
        const sql = typeof typedItem.sql === 'string' ? typedItem.sql.trim() : '';
        if (!sql) {
            return;
        }

        const next: InsightSqlQuery = {
            id: String(typedItem.id || `diag_${idx + 1}`),
            title: String(typedItem.title || `Diagnostic ${idx + 1}`),
            sql,
        };

        if (typeof typedItem.dimension === 'string' && typedItem.dimension.trim()) {
            next.dimension = typedItem.dimension;
        }

        if (typeof typedItem.row_count === 'number' && Number.isFinite(typedItem.row_count)) {
            next.row_count = typedItem.row_count;
        }

        sqlQueries.push(next);
    });

    return sqlQueries;
};

const renderInsightPoints = (content: string) => {
    const lines = (content || '')
        .split(/\n+/)
        .map((line) => line.replace(/^\s*(?:-\s*|\d+[.)]\s*)/, '').trim())
        .filter(Boolean);

    return (
        <ol className="list-decimal pl-5 space-y-3">
            {lines.map((line, idx) => (
                <li key={idx} className="pl-1">
                    {line}
                </li>
            ))}
        </ol>
    );
};

const parseUtcTimestamp = (value?: string): Date | null => {
    if (!value) return null;

    const raw = value.trim();
    if (!raw) return null;

    const hasTimezone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
    const normalized = hasTimezone ? raw : `${raw}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const localDayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export default function ChatInterface() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [chartModes, setChartModes] = useState<Record<string, 'chart' | 'table'>>({});
    const [copiedSqlMsgId, setCopiedSqlMsgId] = useState<string | null>(null);

    // Artifact Viewer State
    const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);

    // Session History State
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [historyClock, setHistoryClock] = useState<number>(() => Date.now());

    const groupedSessions = useMemo(() => {
        const now = new Date();
        const today = localDayStart(now);
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        const sorted = [...sessions].sort((a, b) => {
            const aDate = parseUtcTimestamp(a.updated_at || a.created_at)?.getTime() ?? 0;
            const bDate = parseUtcTimestamp(b.updated_at || b.created_at)?.getTime() ?? 0;
            return bDate - aDate;
        });

        const todaySessions: ChatSession[] = [];
        const yesterdaySessions: ChatSession[] = [];
        const previousSessions: ChatSession[] = [];

        sorted.forEach((session) => {
            const sessionDate = parseUtcTimestamp(session.updated_at || session.created_at);
            if (!sessionDate) {
                previousSessions.push(session);
                return;
            }

            const sessionDay = localDayStart(sessionDate);
            if (sessionDay.getTime() === today.getTime()) {
                todaySessions.push(session);
            } else if (sessionDay.getTime() === yesterday.getTime()) {
                yesterdaySessions.push(session);
            } else {
                previousSessions.push(session);
            }
        });

        return {
            today: todaySessions,
            yesterday: yesterdaySessions,
            previous: previousSessions,
        };
    }, [sessions, historyClock]);

    const activeDatasetName = useMemo(() => {
        if (!selectedDatasetId) {
            return null;
        }
        return datasets.find((d) => d.id === selectedDatasetId)?.name || selectedDatasetId;
    }, [datasets, selectedDatasetId]);


    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
    const [isFullScreenArtifact, setIsFullScreenArtifact] = useState(false);

    // Splitter state: artifactWidthPct = % of the total chat+artifact area given to the artifact
    const [artifactWidthPct, setArtifactWidthPct] = useState(52);
    const isDraggingRef = useRef(false);
    const splitContainerRef = useRef<HTMLDivElement>(null);

    const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDraggingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!isDraggingRef.current || !splitContainerRef.current) return;
            const rect = splitContainerRef.current.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const totalW = rect.width;
            // artifact is on the right — pct of right portion
            const rawPct = ((totalW - offsetX) / totalW) * 100;
            setArtifactWidthPct(Math.min(75, Math.max(25, rawPct)));
        };
        const onMouseUp = () => {
            if (!isDraggingRef.current) return;
            isDraggingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            // If we transition to mobile and had a selected artifact but it wasn't full screen, clear it
            // or if we switch from mobile full screen to desktop, close full screen but keep artifact selected
            if (mobile && selectedArtifactId && !isFullScreenArtifact) {
                 // On mobile, artifacts display inline until maximized.
                 setSelectedArtifactId(null);
            } else if (!mobile && isFullScreenArtifact) {
                 setIsFullScreenArtifact(false);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [selectedArtifactId, isFullScreenArtifact]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    // Load datasets on mount
    // Load available datasets
    useEffect(() => {
        loadDatasets();
    }, []);

    // Load session history on mount
    useEffect(() => {
        loadSessions();
    }, []);

    // Keep history buckets in sync with local day boundaries (Today/Yesterday/Previous).
    useEffect(() => {
        const timer = window.setInterval(() => {
            setHistoryClock(Date.now());
        }, 60_000);
        return () => window.clearInterval(timer);
    }, []);

    const loadDatasets = async () => {
        try {
            const data = await datasetService.listDatasets();
            setDatasets(data);
        } catch (error) {
            console.error('Failed to load datasets:', error);
        }
    };

    const loadSessions = async () => {
        try {
            const data = await chatService.listSessions();
            setSessions(data);
        } catch (error) {
            console.error('Failed to load sessions:', error);
        }
    };

    const loadSession = async (sessionId: string) => {
        try {
            const session = await chatService.getSession(sessionId);
            setCurrentSessionId(session.id);

            // If session has a dataset, select it
            if (session.dataset_id) {
                setSelectedDatasetId(session.dataset_id);
            } else {
                setSelectedDatasetId('');
            }

            const msgs = await chatService.getMessages(sessionId);
            setMessages(msgs);

            // Mobile: close sidebar on selection
            if (window.innerWidth < 768) {
                setIsSidebarOpen(false);
            }
        } catch (error) {
            console.error('Failed to load session:', error);
        }
    };

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this chat session?')) return;

        try {
            await chatService.deleteSession(sessionId);
            setSessions(prev => prev.filter(s => s.id !== sessionId));

            if (currentSessionId === sessionId) {
                setCurrentSessionId(null);
                setMessages([]);
            }
        } catch (error) {
            console.error('Failed to delete session:', error);
        }
    };

    const handleNewChat = () => {
        setCurrentSessionId(null);
        setMessages([]);
        if (window.innerWidth < 768) {
            setIsSidebarOpen(false);
        }
    };

    const handleDownloadCSV = (data: any, title: string) => {
        const rows = data.data?.rows || data.rows || data.data || [];
        if (!Array.isArray(rows) || rows.length === 0) return;

        const headers = Object.keys(rows[0]).join(',');
        const csvRows = rows.map((row: any) =>
            Object.values(row).map(val => `"${val}"`).join(',')
        );
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...csvRows].join('\n');
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `${title || 'vizzy-data'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownloadImage = (messageId: string, title: string) => {
        const container = document.getElementById(`msg-${messageId}`);
        if (!container) return;

        const chartWrapper = container.querySelector('.vizzy-chart-container');
        if (!chartWrapper) return;

        const svg = chartWrapper.querySelector('svg');
        if (!svg) return;

        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(svg);
        if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
            source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }

        const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${title || 'vizzy-chart'}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


    const handleSendMessage = async (text: string) => {
        if (!text.trim()) return;

        if (!selectedDatasetId) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: 'Please select a dataset before sending analytics questions.',
                sequence: prev.length + 1,
                intent_type: 'error'
            }]);
            return;
        }

        let sessionId = currentSessionId;
        const currentSession = sessionId ? sessions.find(s => s.id === sessionId) : undefined;

        // If selected dataset changed, force a new session bound to the current selection.
        if (sessionId && currentSession && (currentSession.dataset_id || '') !== selectedDatasetId) {
            sessionId = null;
            setCurrentSessionId(null);
        }

        if (!sessionId) {
            try {
                const title = text.length > 30 ? text.substring(0, 30) + '...' : text;
                const newSession = await chatService.createSession(selectedDatasetId, undefined, title);
                sessionId = newSession.id;
                setCurrentSessionId(sessionId);
                loadSessions();
            } catch (error) {
                console.error('Failed to create new session:', error);
                return;
            }
        }

        const tempId = Date.now().toString();
        const userMsg: ChatMessage = {
            id: tempId,
            role: 'user',
            content: text,
            sequence: messages.length + 1
        };

        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);

        // Create new AbortController for this request
        abortControllerRef.current = new AbortController();

        try {
            const response = await chatService.sendMessage(sessionId, text, abortControllerRef.current.signal);
            setMessages(prev => {
                const filtered = prev.filter(m => m.id !== tempId);
                return [...filtered, response.user_message, response.assistant_message];
            });
            
            // Auto-open artifact viewer if the assistant's response has a chart
            if (hasRenderableOutput(response.assistant_message.output_data)) {
                setSelectedArtifactId(response.assistant_message.id);
            }
            
        } catch (error: any) {
            // Don't show error if request was aborted
            if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
                console.log('Request was stopped by user');
                return;
            }
            console.error('Failed to send message:', error);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: 'Sorry, I encountered an error responding to your request.',
                sequence: prev.length + 1,
                intent_type: 'error'
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsTyping(false);
        }
    };

    const renderArtifactViewer = () => {
        if (!selectedArtifactId) return null;
        const msg = messages.find(m => m.id === selectedArtifactId);
        if (!msg || !hasRenderableOutput(msg.output_data)) return null;

        const targetData = msg.output_data?.type === 'nl2sql' && msg.output_data?.chart
            ? { ...msg.output_data?.chart, sql: msg.output_data?.sql }
            : msg.output_data;

        const isTableMode = chartModes[msg.id] === 'table';
        const isMultiKpi = isMultiMetricKPIMessage(msg);
        const chartRows = Array.isArray(targetData?.data?.rows) ? targetData.data.rows : (Array.isArray(targetData?.data?.series) ? targetData.data.series : []);

        const confidenceValue: string | null = typeof targetData?.confidence === 'number'
            ? `${(targetData.confidence * 100).toFixed(1)}%`
            : (typeof msg.output_data?.confidence === 'number'
                ? `${(msg.output_data.confidence * 100).toFixed(1)}%`
                : null);

        let metricLabel = 'Analyzed Metric';
        let metricValueStr = '--';
        
        if (typeof targetData?.variance === 'number') {
             metricLabel = String(targetData?.metric || 'Variance').replace(/_/g, ' ');
             metricValueStr = `${targetData.variance > 0 ? '+' : ''}${targetData.variance.toFixed(1)}%`;
        } else {
             const mKey = targetData?.metric || 'value';
             const axisY = targetData?.axes?.y;
             metricLabel = String(targetData?.metric || axisY || targetData?.value_label || 'Metric').replace(/_/g, ' ');
             
             let sum = 0;
             let count = 0;
             chartRows.forEach((item: any) => {
                 const v = Number(item[mKey] ?? item.value ?? (axisY ? item[axisY] : undefined) ?? item.count);
                 if (!isNaN(v)) {
                     sum += v;
                     count++;
                 }
             });
             
             if (count > 0) {
                 metricValueStr = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(sum);
                 const mlLower = metricLabel.toLowerCase();
                 if (mlLower.includes('revenue') || mlLower.includes('price') || mlLower.includes('amount') || mlLower.includes('cost') || mlLower.includes('sales')) {
                     metricValueStr = (targetData?.currency || '$') + metricValueStr;
                 }
             } else if (targetData?.type === 'kpi' && targetData?.data?.value !== undefined) {
                 metricValueStr = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(targetData.data.value);
             }
        }

        return (
            <div
                className={`flex flex-col bg-surface-container-lowest dark:bg-[#0c0c0f] flex-shrink-0 animate-in slide-in-from-right-8 duration-150 relative z-30 border-l border-border-main/50 
                    ${isFullScreenArtifact ? 'fixed inset-0 !w-full z-[100] h-full' : 'h-full md:flex hidden'}`}
                style={!isFullScreenArtifact && !isMobile ? { width: `${artifactWidthPct}%` } : undefined}
            >
                <div className="h-16 flex items-center justify-between px-6 lg:px-8 bg-surface-container-low/30 border-b border-outline-variant/10 sticky top-0 z-10">
                    <div className="flex bg-surface-container-high p-1 rounded-full shadow-inner">
                        <Button
                            type="button"
                            onClick={() => setChartModes(prev => ({ ...prev, [msg.id]: 'chart' }))}
                            className={`px-5 py-1.5 h-auto rounded-full text-xs font-semibold transition-all ${!isTableMode ? 'bg-primary text-white shadow-sm' : 'text-themed-muted hover:text-themed-main'}`}
                            variant="ghost"
                        >
                            Visual
                        </Button>
                        <Button
                            type="button"
                            onClick={() => setChartModes(prev => ({ ...prev, [msg.id]: 'table' }))}
                            className={`px-5 py-1.5 h-auto rounded-full text-xs font-semibold transition-all ${isTableMode ? 'bg-primary text-white shadow-sm' : 'text-themed-muted hover:text-themed-main'}`}
                            variant="ghost"
                        >
                            Data
                        </Button>
                    </div>

                    <div className="flex items-center gap-2 lg:gap-3">
                        <Button
                            type="button"
                            onClick={() => handleDownloadCSV(targetData, targetData?.title || 'data')}
                            className="h-8 px-3 lg:px-4 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface text-xs"
                            variant="ghost"
                        >
                            <Download className="w-3.5 h-3.5 mr-1.5" /> CSV
                        </Button>

                        {targetData?.type !== 'kpi' && !isTableMode && (
                            <Button
                                type="button"
                                onClick={() => handleDownloadImage(msg.id, targetData?.title || 'chart')}
                                className="h-8 px-3 lg:px-4 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface text-xs"
                                variant="ghost"
                            >
                                <Copy className="w-3.5 h-3.5 mr-1.5" /> Image
                            </Button>
                        )}

                        {isMobile && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-themed-muted hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                                onClick={() => setIsFullScreenArtifact(!isFullScreenArtifact)}
                                title={isFullScreenArtifact ? 'Exit Fullscreen' : 'Fullscreen'}
                            >
                                <Maximize2 className="w-4 h-4" />
                            </Button>
                        )}

                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-themed-muted hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                            onClick={() => setSelectedArtifactId(null)}
                            title="Close Artifact Viewer"
                        >
                            <PanelRightClose className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 lg:p-6 bg-surface-container-lowest">
                    <div className="w-full max-w-3xl mx-auto">
                        <div className={`rounded-xl p-4 lg:p-6 bg-surface-container-low border border-outline-variant/15 shadow-xl relative overflow-hidden ${isMultiKpi ? 'h-auto' : ''}`}>
                            <div className="mb-4">
                                <h2 className="text-lg font-bold tracking-tight text-on-surface leading-snug">
                                    {targetData?.title || targetData?.chart?.title || 'Data Analysis Viewer'}
                                </h2>
                                <p className="text-xs text-outline mt-0.5">
                                    {activeDatasetName || 'Global Dataset Analysis'}
                                </p>
                            </div>

                            <div className="vizzy-chart-container bg-surface-container-lowest/60 rounded-xl border border-outline-variant/10 p-3 min-h-[260px]">
                                <ChartRenderer
                                    type={isTableMode ? 'table' : (targetData?.type || 'unknown')}
                                    data={targetData}
                                    title={targetData?.title || targetData?.chart?.title}
                                    currency={targetData?.currency}
                                    variant="minimal"
                                />
                            </div>

                            {confidenceValue && (
                                <div className="flex justify-end items-center pt-4 border-t border-outline-variant/10">
                                    <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                                        <span className="text-[10px] font-label uppercase tracking-widest text-outline">Confidence: {confidenceValue}</span>
                                        <span className="material-symbols-outlined text-outline text-sm">info</span>
                                    </div>
                                </div>
                            )}

                            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none"></div>
                        </div>




                    </div>
                </div>
            </div>
        );
    };

    const renderHistoryList = () => (
        <>
            <div className="p-4 border-b border-border-main/30 flex items-center justify-between font-mono">
                <h2 className="text-xs uppercase tracking-widest text-themed-muted">History</h2>
                <Button type="button" onClick={() => setIsSidebarOpen(false)} variant="ghost" size="icon" className="text-themed-muted hover:text-themed-main transition-colors">
                    <span className="material-symbols-outlined text-[16px] leading-none">close</span>
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
                {[
                    { label: 'Today', items: groupedSessions.today },
                    { label: 'Yesterday', items: groupedSessions.yesterday },
                    { label: 'Previous', items: groupedSessions.previous },
                ].map((group, groupIndex) => {
                    if (!group.items.length) return null;

                    return (
                        <div key={group.label}>
                            <p className={`text-[10px] font-semibold text-themed-muted uppercase tracking-widest px-2 ${groupIndex > 0 ? 'pt-3' : ''}`}>
                                {group.label}
                            </p>
                            {group.items.map(session => (
                                <div
                                    key={session.id}
                                    className={`group w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition cursor-pointer ${currentSessionId === session.id
                                        ? 'bg-primary/10 border border-primary/30 text-primary'
                                        : 'text-themed-muted hover:bg-bg-hover hover:text-themed-main border border-transparent'
                                        }`}
                                    onClick={() => loadSession(session.id)}
                                >
                                    <div className="flex items-start space-x-3 overflow-hidden">
                                        <span className={`material-symbols-outlined text-[16px] leading-none flex-shrink-0 mt-0.5 ${currentSessionId === session.id ? 'text-primary' : ''}`}>chat</span>
                                        <div className="min-w-0">
                                            <p className="font-medium truncate">{session.title || 'Untitled Chat'}</p>
                                            <p className="text-[10px] text-themed-muted truncate mt-0.5 uppercase tracking-wide">
                                                {session.message_count} messages
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        onClick={(e) => handleDeleteSession(e, session.id)}
                                        className={`p-1.5 rounded-sm hover:bg-red-500/10 hover:text-red-500 transition opacity-0 group-hover:opacity-100 ${currentSessionId === session.id ? 'opacity-100' : ''}`}
                                        title="Delete Session"
                                        variant="ghost"
                                        size="icon"
                                    >
                                        <span className="material-symbols-outlined text-[16px] leading-none">delete</span>
                                    </Button>
                                </div>
                            ))}
                        </div>
                    );
                })}

                {sessions.length === 0 && (
                    <div className="text-center py-8 text-themed-muted text-sm">
                        No recent chats
                    </div>
                )}
            </div>

            <div className="p-4 bg-bg-main/40 border-t border-border-main/30">
                <Button
                    type="button"
                    onClick={handleNewChat}
                    className="w-full flex items-center justify-center gap-2 bg-bg-card border border-border-main/40 py-2.5 rounded-xl hover:border-primary/50 transition-colors font-mono text-xs text-themed-main"
                    variant="ghost"
                >
                    <span className="material-symbols-outlined text-[16px] leading-none text-primary">add_circle</span>
                    <span>New Analysis</span>
                </Button>
            </div>
        </>
    );

    return (
        <div ref={splitContainerRef} className="flex h-full bg-white dark:bg-bg-main text-themed-main font-display antialiased relative selection:bg-primary selection:text-white">
            
            {messages.length > 0 && (
                <>
                    <div 
                        className="absolute inset-0 z-0 transition-all duration-700 invert hue-rotate-180 opacity-60 dark:invert-0 dark:hue-rotate-0 dark:opacity-100"
                        style={{
                            backgroundImage: "url('https://pub-940ccf6255b54fa799a9b01050e6c227.r2.dev/ruixen_moon_2.png')",
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            backgroundAttachment: 'fixed',
                        }}
                    />
                    <div className="absolute inset-0 bg-white/70 dark:bg-bg-main/80 backdrop-blur-2xl z-0 transition-opacity duration-700"></div>
                </>
            )}
            
            <div className="grain-overlay z-0 relative pointer-events-none"></div>
            {/* Desktop Sidebar */}
            <div className={`hidden md:flex ${isSidebarOpen ? 'w-72' : 'w-0'} bg-white/70 dark:bg-bg-card/70 backdrop-blur-xl border-r border-border-main/30 transition-all duration-300 flex-col flex-shrink-0 overflow-hidden relative z-10`}>
                {renderHistoryList()}
            </div>

            {/* Mobile Sidebar + Backdrop */}
            {isSidebarOpen && (
                <>
                    <div className="md:hidden fixed inset-0 bg-black/50 z-20" onClick={() => setIsSidebarOpen(false)} />
                    <div className="md:hidden fixed inset-y-0 left-0 w-72 bg-white/70 dark:bg-bg-card/70 backdrop-blur-xl border-r border-border-main/30 z-30 flex flex-col">
                        {renderHistoryList()}
                    </div>
                </>
            )}

            {/* Main Chat Panel */}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative z-10" style={{ minWidth: 0 }}>
                {!isSidebarOpen && (
                    <div className="absolute left-4 top-4 z-20">
                        <Button
                            type="button"
                            onClick={() => setIsSidebarOpen(true)}
                            className="h-9 px-3 bg-bg-card border border-border-main/40 rounded-xl text-themed-muted hover:text-primary hover:border-primary/40 transition-colors"
                            variant="ghost"
                        >
                            <span className="material-symbols-outlined text-[16px] leading-none">menu_open</span>
                            <span className="ml-1 text-[11px] uppercase tracking-wider">History</span>
                        </Button>
                    </div>
                )}

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto w-full">
                    {messages.length === 0 ? (
                        <RuixenMoonChat
                            onSendMessage={handleSendMessage}
                            datasets={datasets}
                            selectedDatasetId={selectedDatasetId}
                            onDatasetChange={setSelectedDatasetId}
                        />
                    ) : (
                    <div className="p-6 md:p-10 space-y-8 max-w-5xl mx-auto w-full">
                        <>
                            {messages.map((msg) => (
                                <div key={msg.id} id={`msg-${msg.id}`} className={`flex w-full mb-8 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`${['analysis', 'visualization', 'dashboard', 'comparative', 'aggregative', 'trend'].includes(msg.intent_type || '') && msg.output_data?.type !== 'kpi' ? 'max-w-7xl w-full' : 'max-w-xl'} flex items-start space-x-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                        {msg.role === 'assistant' && (
                                            <div className="w-10 h-10 rounded-sm bg-primary border-b-2 border-[#4f46e5] flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold text-white font-display font-light shadow-[0_0_15px_rgba(108,99,255,0.3)]">
                                                VX
                                            </div>
                                        )}
                                        <div className={`px-5 py-4 ${msg.role === 'user' ? 'bg-primary text-white rounded-xl shadow-sm' : 'bg-surface-container-lowest dark:bg-surface-container/80 dark:backdrop-blur-md border border-transparent dark:border-white/5 rounded-xl text-on-surface'} ${['analysis', 'visualization', 'dashboard', 'comparative', 'aggregative', 'trend'].includes(msg.intent_type || '') && msg.output_data?.type !== 'kpi' ? 'w-full' : ''} ${msg.output_data?.type === 'kpi' ? 'w-auto' : ''}`}>
                                            <div className="text-sm leading-relaxed">
                                                {isInsightMessage(msg) ? (
                                                    (() => {
                                                        const insightSqlQueries = getInsightSqlQueries(msg);
                                                        return (
                                                            <div className="space-y-4 w-full">
                                                                <div className="markdown-content text-themed-main">
                                                                    {renderInsightPoints(msg.content)}
                                                                </div>

                                                                {insightSqlQueries.length > 0 && (
                                                                    <div className="rounded-sm border border-border-main bg-bg-main/40">
                                                                        <div className="flex items-center justify-between px-3 py-2 border-b border-border-main/70">
                                                                            <div className="flex items-center gap-2.5">
                                                                                <span className="text-[10px] font-semibold font-mono tracking-[0.16em] uppercase text-themed-muted">
                                                                                    Insight SQL
                                                                                </span>
                                                                                <span className="text-[10px] font-medium font-mono tracking-widest uppercase px-2 py-0.5 rounded-sm bg-primary/15 text-primary border border-primary/30">
                                                                                    {insightSqlQueries.length} queries
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        <div className="px-3 py-3 space-y-3">
                                                                            {insightSqlQueries.map((item, idx) => {
                                                                                const copyKey = `${msg.id}::insight-sql::${item.id}`;
                                                                                return (
                                                                                    <div key={copyKey} className="rounded-sm border border-border-main/70 bg-bg-card/70">
                                                                                        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border-main/70">
                                                                                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                                                                                                <span className="text-[10px] font-medium font-mono tracking-widest uppercase px-1.5 py-0.5 rounded-sm bg-bg-main/70 text-themed-muted border border-border-main/70">
                                                                                                    #{idx + 1}
                                                                                                </span>
                                                                                                <span className="text-xs font-semibold text-themed-main truncate">
                                                                                                    {item.title}
                                                                                                </span>
                                                                                                {item.dimension && (
                                                                                                    <span className="text-[10px] font-medium font-mono tracking-widest uppercase px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary border border-primary/20">
                                                                                                        {item.dimension}
                                                                                                    </span>
                                                                                                )}
                                                                                                {typeof item.row_count === 'number' && (
                                                                                                    <span className="text-[10px] font-medium font-mono tracking-widest uppercase px-1.5 py-0.5 rounded-sm bg-bg-main/70 text-themed-muted border border-border-main/70">
                                                                                                        {item.row_count} rows
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>

                                                                                            <Button
                                                                                                type="button"
                                                                                                onClick={() => {
                                                                                                    navigator.clipboard.writeText(item.sql);
                                                                                                    setCopiedSqlMsgId(copyKey);
                                                                                                    setTimeout(() => setCopiedSqlMsgId(null), 2000);
                                                                                                }}
                                                                                                className="text-[10px] font-mono font-semibold tracking-widest uppercase text-themed-muted hover:text-primary transition-colors flex items-center gap-1 flex-shrink-0"
                                                                                                variant="ghost"
                                                                                                size="sm"
                                                                                            >
                                                                                                {copiedSqlMsgId === copyKey ? (
                                                                                                    <><span className="material-symbols-outlined text-[13px] leading-none text-primary">check</span> Copied!</>
                                                                                                ) : (
                                                                                                    <><span className="material-symbols-outlined text-[13px] leading-none">content_copy</span> Copy</>
                                                                                                )}
                                                                                            </Button>
                                                                                        </div>

                                                                                        <pre className="mx-3 my-3 p-3 bg-bg-card border border-border-main/70 rounded-sm text-xs font-mono text-primary overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                                                                            <code>{item.sql}</code>
                                                                                        </pre>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()
                                                ) : ['analysis', 'visualization', 'dashboard', 'comparative', 'aggregative', 'trend', 'text_query', 'clarification'].includes(msg.intent_type || '') ? (
                                                    <div className="space-y-4 w-full">
                                                        {!isKPIMessage(msg) && (
                                                            <div className="markdown-content text-themed-main">
                                                                <ReactMarkdown
                                                                    remarkPlugins={[remarkGfm]}
                                                                    components={{
                                                                        p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                                                                        h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-themed-main mt-4 mb-2" {...props} />,
                                                                        h2: ({ node, ...props }) => <h2 className="text-lg font-bold text-themed-main mt-3 mb-2" {...props} />,
                                                                        ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                                                                        ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                                                                        li: ({ node, ...props }) => <li className="" {...props} />,
                                                                        strong: ({ node, ...props }) => <strong className="font-bold text-themed-main" {...props} />,
                                                                        a: ({ node, ...props }) => <a className="text-primary hover:underline" {...props} />,
                                                                        code: ({ node, ...props }) => <code className="bg-bg-card px-1 py-0.5 rounded text-sm font-mono text-primary border border-border-main" {...props} />,
                                                                    }}
                                                                >
                                                                    {msg.content}
                                                                </ReactMarkdown>
                                                            </div>
                                                        )}

                                                        {/* ── Ambiguity Clarification Cards ── */}
                                                        {msg.output_data?.type === 'clarification' && msg.output_data?.ambiguity && (
                                                            <div className="mt-4">
                                                                <div className="flex items-center gap-2 mb-3">
                                                                    <span className="material-symbols-outlined text-[16px] text-primary leading-none">conversion_path</span>
                                                                    <span className="text-sm font-bold text-themed-main">{msg.output_data.ambiguity.question}</span>
                                                                </div>
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                    {msg.output_data.ambiguity.candidates.map((candidate: any, idx: number) => {
                                                                        const originalQuery = msg.output_data.ambiguity.original_query || '';
                                                                        const term = msg.output_data.ambiguity.term || '';
                                                                        const newQuery = buildClarifiedQuery(originalQuery, term, candidate.column);
                                                                        const confidence = Math.round(candidate.score * 100);
                                                                        return (
                                                                            <Button
                                                                                type="button"
                                                                                key={idx}
                                                                                onClick={() => handleSendMessage(newQuery)}
                                                                                className="flex items-center justify-between px-4 py-3 bg-bg-card border border-border-main rounded-md hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 group text-left"
                                                                                variant="ghost"
                                                                            >
                                                                                <div>
                                                                                    <span className="font-mono text-sm font-bold text-themed-main group-hover:text-primary transition-colors">
                                                                                        {candidate.column}
                                                                                    </span>
                                                                                </div>
                                                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm border ${confidence >= 85 ? 'bg-green-500/10 text-green-600 border-green-500/20'
                                                                                    : confidence >= 70 ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                                                                        : 'bg-bg-main text-themed-muted border-border-main'
                                                                                    }`}>
                                                                                    {confidence}% match
                                                                                </span>
                                                                            </Button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {hasRenderableOutput(msg.output_data) && (() => {
                                                            const targetData = msg.output_data.type === 'nl2sql' && msg.output_data.chart
                                                                ? { ...msg.output_data.chart, sql: msg.output_data.sql }
                                                                : msg.output_data;

                                                            const isTableMode = chartModes[msg.id] === 'table';
                                                            const sqlQuery = targetData.sql || msg.output_data.sql;
                                                            const isSelected = selectedArtifactId === msg.id;

                                                            const isKpiOnly = targetData.type === 'kpi';
                                                            const isInteractiveArtifact = !isKpiOnly;
                                                            const previewBars = getArtifactPreviewBars(targetData);

                                                            return (
                                                                <div className={`${isMultiMetricKPIMessage(msg) ? 'mt-2' : 'mt-6'} w-full relative`}>
                                                                    
                                                                    {isInteractiveArtifact ? (
                                                                        <div 
                                                                            className={`bg-surface-container rounded-xl overflow-hidden border border-outline-variant/20 cursor-pointer group transition-all hover:border-primary/40 ${isSelected && !isMobile ? 'ring-2 ring-primary/60 shadow-lg shadow-primary/10' : ''}`}
                                                                            onClick={() => {
                                                                                setSelectedArtifactId(msg.id);
                                                                                if (isMobile) setIsFullScreenArtifact(true);
                                                                            }}
                                                                        >
                                                                            <div className="h-24 bg-surface-container-low flex items-end gap-1 px-4 pb-2">
                                                                                {previewBars.map((height: number, idx: number) => (
                                                                                    <div
                                                                                        key={`${msg.id}-bar-${idx}`}
                                                                                        className="flex-1 bg-primary/30 group-hover:bg-primary/45 transition-colors rounded-t-sm"
                                                                                        style={{ height: `${height}%` }}
                                                                                    />
                                                                                ))}
                                                                            </div>

                                                                            <div className="p-3 flex justify-between items-center bg-surface-container-high border-t border-outline-variant/10">
                                                                                <div className="min-w-0">
                                                                                    <h4 className="text-xs font-bold text-on-surface truncate">
                                                                                        {targetData?.title || targetData?.chart?.title || 'Data Artifact'}
                                                                                    </h4>
                                                                                    <p className="text-[10px] text-outline truncate">Interactive Visualization</p>
                                                                                </div>
                                                                                <span className="material-symbols-outlined text-primary text-lg">open_in_new</span>
                                                                            </div>

                                                                            {isSelected && !isMobile && (
                                                                                <span className="absolute top-3 right-3 flex h-3 w-3">
                                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                                                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                    <div className="vizzy-chart-container bg-surface-container-lowest dark:bg-surface-container/80 dark:backdrop-blur-md border border-transparent dark:border-white/5 rounded-xl p-4 shadow-sm pb-3">
                                                                        <ChartRenderer
                                                                            type={isTableMode ? 'table' : (targetData.type || 'unknown')}
                                                                            data={targetData}
                                                                            title={targetData.title || targetData.chart?.title}
                                                                            currency={targetData.currency}
                                                                            variant="minimal"
                                                                        />

                                                                        {/* Actions Bar */}
                                                                        <div className="mt-4 flex flex-col border-t border-border-main pt-3">
                                                                            <div className="flex items-center justify-between">
                                                                                <div className="flex items-center space-x-4">
                                                                                    {targetData.type !== 'kpi' && msg.output_data.response_type !== 'text' && (
                                                                                        <div className="flex bg-surface-container-low dark:bg-white/5 p-0.5 rounded-lg shadow-inner group transition-colors">
                                                                                            <Button
                                                                                                type="button"
                                                                                                onClick={() => setChartModes(prev => ({ ...prev, [msg.id]: 'chart' }))}
                                                                                                className={`px-4 py-1.5 text-[10px] font-mono tracking-widest uppercase transition-all ${!isTableMode ? 'bg-primary text-white font-bold shadow-sm' : 'text-themed-muted hover:text-themed-main'}`}
                                                                                                variant="ghost"
                                                                                            >
                                                                                                Visual
                                                                                            </Button>
                                                                                            <Button
                                                                                                type="button"
                                                                                                onClick={() => setChartModes(prev => ({ ...prev, [msg.id]: 'table' }))}
                                                                                                className={`px-4 py-1.5 text-[10px] font-mono tracking-widest uppercase transition-all ${isTableMode ? 'bg-primary text-white font-bold shadow-sm' : 'text-themed-muted hover:text-themed-main'}`}
                                                                                                variant="ghost"
                                                                                            >
                                                                                                Data
                                                                                            </Button>
                                                                                        </div>
                                                                                    )}
                                                                                </div>

                                                                            <div className="flex items-center space-x-3">
                                                                                <Button
                                                                                    type="button"
                                                                                    onClick={() => handleDownloadCSV(targetData, targetData.title || 'data')}
                                                                                    className="flex items-center space-x-1.5 text-[10px] uppercase tracking-wider font-bold text-themed-muted hover:text-green-600 transition-colors p-1"
                                                                                    title="Download CSV"
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-[14px] leading-none">table_view</span>
                                                                                    <span>CSV</span>
                                                                                </Button>

                                                                                {targetData.type !== 'kpi' && msg.output_data.response_type !== 'text' && (
                                                                                    <Button
                                                                                        type="button"
                                                                                        onClick={() => handleDownloadImage(msg.id, targetData.title || 'chart')}
                                                                                        className="flex items-center space-x-1.5 text-[10px] uppercase tracking-wider font-bold text-themed-muted hover:text-blue-600 transition-colors p-1"
                                                                                        title="Download SVG"
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                    >
                                                                                        <span className="material-symbols-outlined text-[14px] leading-none">download</span>
                                                                                        <span>SVG</span>
                                                                                    </Button>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* SQL Panel */}
                                                                        {sqlQuery && (
                                                                            <div className="mt-4 rounded-sm border border-border-main bg-bg-main/40">
                                                                                <div className="flex items-center justify-between px-3 py-2 border-b border-border-main/70">
                                                                                    <div className="flex items-center gap-2.5">
                                                                                        <span className="text-[10px] font-semibold font-mono tracking-[0.16em] uppercase text-themed-muted">
                                                                                            Generated SQL
                                                                                        </span>
                                                                                        {msg.output_data?.detected_intent && (
                                                                                            <span className="text-[10px] font-medium font-mono tracking-widest uppercase px-2 py-0.5 rounded-sm bg-primary/15 text-primary border border-primary/30">
                                                                                                {msg.output_data.detected_intent}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <Button
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            navigator.clipboard.writeText(sqlQuery);
                                                                                            setCopiedSqlMsgId(msg.id);
                                                                                            setTimeout(() => setCopiedSqlMsgId(null), 2000);
                                                                                        }}
                                                                                        className="text-[10px] font-mono font-semibold tracking-widest uppercase text-themed-muted hover:text-primary transition-colors flex items-center gap-1"
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                    >
                                                                                        {copiedSqlMsgId === msg.id ? (
                                                                                            <><span className="material-symbols-outlined text-[13px] leading-none text-primary">check</span> Copied!</>
                                                                                        ) : (
                                                                                            <><span className="material-symbols-outlined text-[13px] leading-none">content_copy</span> Copy</>
                                                                                        )}
                                                                                    </Button>
                                                                                </div>
                                                                                <pre className="mx-3 my-3 p-3 bg-bg-card border border-border-main/70 rounded-sm text-xs font-mono text-primary overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                                                                    <code>{sqlQuery}</code>
                                                                                </pre>

                                                                                {/* Timing Strip */}
                                                                                {msg.output_data?.timing && (
                                                                                    <div className="px-3 pb-3 pt-0.5 flex items-center gap-2 flex-wrap">
                                                                                        {(() => {
                                                                                            const t = msg.output_data.timing;
                                                                                            const toneFor = (ms: number) => ms > 3000
                                                                                                ? 'text-red-500 bg-red-50 border-red-200'
                                                                                                : ms > 1000
                                                                                                    ? 'text-amber-600 bg-amber-50 border-amber-200'
                                                                                                    : 'text-emerald-600 bg-emerald-50 border-emerald-200';
                                                                                            return (
                                                                                                <>
                                                                                                    <span className={`text-[10px] font-mono font-semibold px-2 py-1 rounded-sm border ${toneFor(t.llm_ms)}`}>
                                                                                                        LLM {(t.llm_ms / 1000).toFixed(2)}s
                                                                                                    </span>
                                                                                                    <span className={`text-[10px] font-mono font-semibold px-2 py-1 rounded-sm border ${toneFor(t.validation_ms)}`}>
                                                                                                        Validation {t.validation_ms}ms
                                                                                                    </span>
                                                                                                    <span className={`text-[10px] font-mono font-semibold px-2 py-1 rounded-sm border ${toneFor(t.execution_ms)}`}>
                                                                                                        DB {t.execution_ms}ms
                                                                                                    </span>
                                                                                                    <span className="text-[10px] font-mono font-semibold px-2 py-1 rounded-sm border border-border-main text-themed-main bg-bg-main/70">
                                                                                                        Total {(t.total_ms / 1000).toFixed(2)}s
                                                                                                    </span>
                                                                                                    {t.retries > 0 && (
                                                                                                        <span className="text-[10px] font-mono font-semibold px-2 py-1 rounded-sm border border-amber-200 text-amber-600 bg-amber-50">
                                                                                                            Retries {t.retries}
                                                                                                        </span>
                                                                                                    )}
                                                                                                </>
                                                                                            );
                                                                                        })()}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}

                                                                        {/* NL2SQL Diagnostics Card */}
                                                                        {msg.output_data?.nl2sql_diagnostics && (
                                                                            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs">
                                                                                <div className="flex items-center gap-2 mb-2">
                                                                                    <span className="material-symbols-outlined text-[14px] text-amber-600 leading-none">warning</span>
                                                                                    <span className="text-amber-600 font-bold uppercase tracking-wider text-[10px]">Query Diagnostic</span>
                                                                                    <span className="px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-700 font-mono text-[10px]">
                                                                                        {msg.output_data.nl2sql_diagnostics.error_type}
                                                                                    </span>
                                                                                </div>
                                                                                {msg.output_data.nl2sql_diagnostics.suggestion && (
                                                                                    <p className="text-amber-700 mb-2">{msg.output_data.nl2sql_diagnostics.suggestion}</p>
                                                                                )}
                                                                                {msg.output_data.nl2sql_diagnostics.attempted_sql && (
                                                                                    <details className="mt-1">
                                                                                        <summary className="text-[10px] text-amber-600 cursor-pointer font-medium">View failed SQL</summary>
                                                                                        <pre className="mt-1 p-2 bg-bg-main rounded-sm text-[10px] font-mono text-red-500 overflow-x-auto whitespace-pre-wrap border border-border-main">{msg.output_data.nl2sql_diagnostics.attempted_sql}</pre>
                                                                                    </details>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}

                                                        {/* Follow-up Suggestions */}
                                                        {msg.output_data?.followup_suggestions?.length > 0 && (
                                                            <div className="mt-6 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2 duration-700">
                                                                {msg.output_data.followup_suggestions.map((suggestion: string, idx: number) => (
                                                                    <Button
                                                                        type="button"
                                                                        key={idx}
                                                                        onClick={() => handleSendMessage(suggestion)}
                                                                        disabled={!selectedDatasetId}
                                                                        className="px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-sm text-xs font-medium text-primary hover:bg-primary hover:text-white transition-colors"
                                                                        variant="ghost"
                                                                    >
                                                                        {suggestion}
                                                                    </Button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="markdown-content">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                            {msg.content}
                                                        </ReactMarkdown>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {msg.role === 'user' && (
                                            <div className="w-10 h-10 rounded-xl bg-bg-card border border-border-main flex items-center justify-center text-themed-main font-mono text-xs flex-shrink-0 shadow-xl">U</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {isTyping && (
                                <div className="flex justify-start">
                                    <div className="max-w-xl flex items-start space-x-3">
                                        <div className="w-10 h-10 rounded-sm bg-primary border-b-2 border-[#4f46e5] flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold text-white font-display font-light shadow-[0_0_15px_rgba(108,99,255,0.3)]">
                                            VX
                                        </div>
                                        <div className="bg-surface-container-lowest dark:bg-surface-container/80 dark:backdrop-blur-md border border-transparent dark:border-white/5 rounded-xl px-5 py-4 transition-colors duration-300">
                                            <ShiningText text="Vizzy is Analyzing..." />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area (Only show when there are messages because RuixenMoonChat has its own) */}
                {messages.length > 0 && (
                    <div className="bg-white/40 dark:bg-bg-main/60 backdrop-blur-md border-t border-border-main/30 px-4 py-3 md:px-6 md:py-4 flex-shrink-0 transition-colors duration-500 z-10 w-full relative">
                        <div className="max-w-4xl mx-auto">
                            <div className="px-2">
                                <AIInput
                                    id="chat-analytics-input"
                                    placeholder={selectedDatasetId ? 'Ask vizzy to analyze the Data' : 'Select a dataset to start chatting'}
                                    minHeight={52}
                                    maxHeight={180}
                                    disabled={!selectedDatasetId}
                                    isLoading={isTyping}
                                    onSubmit={(value) => handleSendMessage(value)}
                                    onStop={handleStop}
                                    className="py-2"
                                    contextBadge={activeDatasetName ? { value: activeDatasetName } : undefined}
                                />
                            </div>
                            {!selectedDatasetId && <p className="text-xs text-red-500 mt-2">Please select a dataset to start chatting</p>}
                            <p className="text-[10px] text-themed-muted mt-2 text-center">Vizzy can make mistakes. Check important info.</p>
                        </div>
                    </div>
                )}
            </div>{/* main chat panel */}

            {/* Drag splitter — only between chat + artifact on desktop */}
            {selectedArtifactId && !isMobile && !isFullScreenArtifact && (
                <div
                    onMouseDown={handleSplitterMouseDown}
                    className="hidden md:flex flex-shrink-0 w-1.5 items-center justify-center cursor-col-resize relative z-40 group bg-transparent hover:bg-primary/10 transition-colors"
                    title="Drag to resize"
                >
                    <div className="w-0.5 h-12 rounded-full bg-border-main/40 group-hover:bg-primary/60 transition-colors" />
                </div>
            )}

            {/* Right Side Artifact Viewer Panel */}
            {renderArtifactViewer()}

        </div>
    );
}
