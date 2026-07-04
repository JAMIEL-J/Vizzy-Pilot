import { useState, useRef, useEffect, useMemo } from 'react';
import { chatService, type ChatMessage, type ChatSession } from '../../lib/api/chat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { datasetService, type Dataset, type DatasetVersionSummary } from '../../lib/api/dataset';
import ChartRenderer from '../../components/chat/ChartRenderer';
import SqlEditor from '../../components/chat/SqlEditor';
import { 
    PanelRightClose, Download, Copy, Maximize2, 
    Sparkles, Database, Code2, Check, ArrowUp,
    BarChart3, AlertCircle, X, Plus, MessageSquare,
    PanelLeft, PanelLeftClose, Table as TableIcon, FileText, Wand2, BrainCog, Globe,
    ChevronDown, ChevronRight
} from 'lucide-react';
import { Panel, PanelHeader, Pill, BtnGhost, BtnSecondary, BtnAccent } from '@/components/ui/primitive';
import RuixenMoonChat from '../../components/ui/ruixen-moon-chat';
import { PromptInputBox } from '@/components/ui/ai-prompt-box';
import { useLocation, useNavigate } from 'react-router-dom';
import { VizzyPilotLogoIcon } from '../../components/layout/VizzyLogo';

// --- Helpers ---
const isInsightMessage = (msg: ChatMessage) => {
    const contentType = msg.output_data?.type;
    return msg.intent_type === 'interpretive' || contentType === 'interpretive_text' || contentType === 'interpretive';
};

const hasRenderableOutput = (outputData: any) => {
    if (!outputData || outputData.type === 'clarification') return false;
    if (outputData.type === 'kpi') return true;
    if (outputData.type === 'nl2sql') {
        if (outputData.chart?.type === 'kpi') return true;
        if (outputData.response_type === 'text') return false;
        return Boolean(outputData.chart);
    }
    if (outputData.response_type === 'text') return false;
    return Boolean(outputData.chart || outputData.data);
};

const isMultiMetricKPIMessage = (msg: ChatMessage) => {
    const outputData = msg.output_data;
    if (!outputData) return false;
    const chartPayload = outputData.type === 'nl2sql' ? outputData.chart : outputData;
    const metrics = chartPayload?.data?.metrics;
    return chartPayload?.type === 'kpi' && Array.isArray(metrics) && metrics.length > 1;
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
    if (!outputData || typeof outputData !== 'object') return [];
    const candidatesRaw: unknown[] = Array.isArray(outputData.diagnostic_sql_queries)
        ? outputData.diagnostic_sql_queries
        : (Array.isArray(outputData.diagnostics) ? outputData.diagnostics : []);
    const sqlQueries: InsightSqlQuery[] = [];
    if ('sql' in outputData && typeof outputData.sql === 'string' && outputData.sql.trim()) {
        sqlQueries.push({ id: 'primary', title: 'Generated SQL', sql: outputData.sql.trim() });
    }
    candidatesRaw.forEach((item, idx) => {
        if (!item || typeof item !== 'object') return;
        const typedItem = item as Record<string, any>;
        const sql = typeof typedItem.sql === 'string' ? typedItem.sql.trim() : '';
        if (!sql) return;
        const next: InsightSqlQuery = {
            id: String(typedItem.id || `diag_${idx + 1}`),
            title: String(typedItem.title || `Diagnostic ${idx + 1}`),
            sql,
        };
        if (typeof typedItem.dimension === 'string' && typedItem.dimension.trim()) next.dimension = typedItem.dimension;
        if (typeof typedItem.row_count === 'number' && Number.isFinite(typedItem.row_count)) next.row_count = typedItem.row_count;
        sqlQueries.push(next);
    });
    return sqlQueries;
};

const renderInsightPoints = (content: string) => {
    const lines = (content || '').split(/\n+/).map((line) => line.replace(/^\s*(?:-\s*|\d+[.)]\s*)/, '').trim()).filter(Boolean);
    if (lines.length === 0) {
        return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>;
    }
    return (
        <ol className="list-decimal pl-5 space-y-3">
            {lines.map((line, idx) => (
                <li key={idx} className="pl-1 leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: 'span' }}>
                        {line}
                    </ReactMarkdown>
                </li>
            ))}
        </ol>
    );
};

const splitInsightIntoPoints = (content: string): string[] => {
    if (!content) return [];
    
    // First, try splitting on newlines (in case the LLM already emitted bullet points)
    const newlinePoints = content
        .split(/\n+/)
        .map((line) => line.replace(/^\s*(?:-\s*|\d+[.)]\s*|•\s*)/, '').trim())
        .filter(Boolean);
        
    if (newlinePoints.length > 1) {
        return newlinePoints;
    }
    
    // Otherwise, split a paragraph into sentences
    let normalized = content.replace(/\s+/g, ' ').trim();
    normalized = normalized.replace(/^\s*(?:-\s*|\d+[.)]\s*|•\s*)/, '').trim();
    if (!normalized) return [];
    
    // Split safely without lookbehind to support older browsers (only split on punctuation followed by space)
    const parts = normalized.split(/([.!?])\s+/);
    const sentencePoints: string[] = [];
    for (let i = 0; i < parts.length; i += 2) {
        const text = parts[i];
        const punc = parts[i + 1] || '';
        if (text) sentencePoints.push((text + punc).trim());
    }
    
    if (sentencePoints.length > 1) {
        return sentencePoints;
    }
    return [normalized];
};

const renderAnalysisInsight = (msg: ChatMessage) => {
    const explanation = msg.output_data?.explanation;
    const keyInsight = (explanation?.key_insight || '').toString().trim();
    // Prefer the rich `detailed` explanation from the backend, then the raw content
    const detailedSource =
        (explanation?.detailed && String(explanation.detailed).trim()) ||
        (explanation?.summary && String(explanation.summary).trim()) ||
        msg.content ||
        '';
    // Strip a trailing "**Key Insight:** ..." line from the source so we don't duplicate it
    let source = detailedSource;
    if (keyInsight) {
        const kiLower = keyInsight.toLowerCase();
        const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const kiRegex = new RegExp(`\\*?\\*?Key Insight:?\\*?\\*?:?\\s*${escapeRegExp(kiLower)}.*$`, 'i');
        source = source.replace(kiRegex, '').trim();
    }
    const points = splitInsightIntoPoints(source);
    if (points.length === 0 && !keyInsight) {
        return <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>;
    }
    return (
        <div className="space-y-3">
            {points.length > 0 && (
                <ul className="list-disc pl-5 space-y-2 marker:text-primary/60">
                    {points.map((point, idx) => (
                        <li key={idx} className="pl-1 leading-relaxed text-foreground/90">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: 'span' }}>
                                {point}
                            </ReactMarkdown>
                        </li>
                    ))}
                </ul>
            )}
            {keyInsight && (
                <div className="relative mt-3 overflow-hidden rounded-xl border border-white/20 bg-gradient-to-br from-white/[0.08] to-white/[0.02] px-4 py-3 shadow-lg shadow-primary/5 backdrop-blur-2xl before:pointer-events-none before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-br before:from-primary/10 before:to-transparent">
                    <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-gradient-to-b from-primary/80 via-primary/40 to-transparent" />
                    <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-primary/10 blur-2xl" />
                    <div className="relative flex items-start gap-3">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold tracking-wider text-primary backdrop-blur-sm">
                            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none"><path d="M8 1L10 5.5L15 6L11.5 9.5L12.5 15L8 12L3.5 15L4.5 9.5L1 6L6 5.5L8 1Z" fill="currentColor"/></svg>
                        </span>
                        <span className="text-sm leading-relaxed text-foreground/90 [&_strong]:text-primary [&_strong]:font-semibold">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: 'span' }}>
                                {keyInsight}
                            </ReactMarkdown>
                        </span>
                    </div>
                </div>
            )}
        </div>
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

const getMessageArtifactPayload = (msg?: ChatMessage | null) => {
    if (!msg || !hasRenderableOutput(msg.output_data)) return null;
    return msg.output_data?.type === 'nl2sql' && msg.output_data?.chart
        ? { ...msg.output_data.chart, sql: msg.output_data.sql, confidence: msg.output_data.confidence }
        : msg.output_data;
};

export default function ChatInterface() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [thinkProgress, setThinkProgress] = useState<{ step: number; total: number; phase: string; detail: string; query_index?: number; query_total?: number } | null>(null);
    const [thoughtSteps, setThoughtSteps] = useState<{ id: number; content: string; timestamp: string; duration_ms?: number }[]>([]);
    const currentThoughtStepsRef = useRef<{ id: number; content: string; timestamp: string; duration_ms?: number }[]>([]);
    const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
    const [initialSuggestions, setInitialSuggestions] = useState<string[]>([]);
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [selectedDatasetId, setSelectedDatasetId] = useState<string>(() => localStorage.getItem('vizzy_last_dataset_id') || '');
    const [versions, setVersions] = useState<DatasetVersionSummary[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState<string>(() => localStorage.getItem('vizzy_last_version_id') || '');
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [chartModes, setChartModes] = useState<Record<string, 'chart' | 'table'>>({});
    const [copiedSqlMsgId, setCopiedSqlMsgId] = useState<string | null>(null);
    const [showSql, setShowSql] = useState<Record<string, boolean>>({});
    const [isEditingSqlMode, setIsEditingSqlMode] = useState<Record<string, boolean>>({});
    const [editingSql, setEditingSql] = useState<Record<string, string>>({});
    const [executingSql, setExecutingSql] = useState<Record<string, boolean>>({});
    const [sqlError, setSqlError] = useState<Record<string, string | null>>({});
    const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
    const [isArtifactVisible, setIsArtifactVisible] = useState(false);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [historyClock, setHistoryClock] = useState<number>(() => Date.now());
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
    const [isFullScreenArtifact, setIsFullScreenArtifact] = useState(false);
    const [artifactWidthPct] = useState(52);
    const [error, setError] = useState<string | null>(null);
    const [draftMessage, setDraftMessage] = useState('');

    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        if (location.state?.datasetId) {
            setSelectedDatasetId(location.state.datasetId);
            if (location.state?.versionId) {
                setSelectedVersionId(location.state.versionId);
            }
            if (location.state?.initialPrompt) {
                setDraftMessage(location.state.initialPrompt);
            }
            // Clear state so refresh doesn't trigger it again
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const splitContainerRef = useRef<HTMLDivElement>(null);

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
            if (sessionDay.getTime() === today.getTime()) todaySessions.push(session);
            else if (sessionDay.getTime() === yesterday.getTime()) yesterdaySessions.push(session);
            else previousSessions.push(session);
        });
        return { today: todaySessions, yesterday: yesterdaySessions, previous: previousSessions };
    }, [sessions, historyClock]);

    const activeDatasetName = useMemo(() => {
        if (!selectedDatasetId) return null;
        return datasets.find((d) => d.id === selectedDatasetId)?.name || selectedDatasetId;
    }, [datasets, selectedDatasetId]);

    const currentSessionTitle = useMemo(() => {
        if (!currentSessionId) return 'New analysis';
        return sessions.find((session) => session.id === currentSessionId)?.title || 'Current analysis';
    }, [currentSessionId, sessions]);

    const activeArtifactMessage = useMemo(() => {
        if (!isArtifactVisible) return null;
        const explicit = selectedArtifactId ? messages.find((m) => m.id === selectedArtifactId) : null;
        if (explicit && hasRenderableOutput(explicit.output_data)) return explicit;
        return [...messages].reverse().find((m) => hasRenderableOutput(m.output_data)) || null;
    }, [messages, selectedArtifactId, isArtifactVisible]);

    const activeArtifactPayload = useMemo(() => getMessageArtifactPayload(activeArtifactMessage), [activeArtifactMessage]);

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            if (mobile && selectedArtifactId && !isFullScreenArtifact) setSelectedArtifactId(null);
            else if (!mobile && isFullScreenArtifact) setIsFullScreenArtifact(false);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [selectedArtifactId, isFullScreenArtifact]);

    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

    useEffect(() => { loadDatasets(); loadSessions(); }, []);

    useEffect(() => {
        if (selectedDatasetId) {
            datasetService.listVersionsForDataset(selectedDatasetId)
                .then(v => {
                    setVersions(v || []);
                    if (v && v.length > 0) {
                        const savedVerId = localStorage.getItem('vizzy_last_version_id');
                        const exists = v.some(ver => ver.id === savedVerId);
                        if (exists && savedVerId) {
                            setSelectedVersionId(savedVerId);
                        } else {
                            setSelectedVersionId(v[v.length - 1].id);
                        }
                    }
                })
                .catch(err => console.error("Failed to load versions:", err));
        } else {
            setVersions([]);
            setSelectedVersionId('');
        }
    }, [selectedDatasetId]);

    useEffect(() => {
        if (selectedDatasetId) {
            localStorage.setItem('vizzy_last_dataset_id', selectedDatasetId);
        }
    }, [selectedDatasetId]);

    useEffect(() => {
        if (selectedVersionId) {
            localStorage.setItem('vizzy_last_version_id', selectedVersionId);
        }
    }, [selectedVersionId]);

    useEffect(() => {
        const timer = window.setInterval(() => setHistoryClock(Date.now()), 60_000);
        return () => window.clearInterval(timer);
    }, []);

    const loadDatasets = async () => {
        try {
            const data = await datasetService.listDatasets();
            setDatasets(data);
            if (data && data.length > 0) {
                const savedId = localStorage.getItem('vizzy_last_dataset_id');
                const exists = data.some(d => d.id === savedId);
                if (exists && savedId) {
                    setSelectedDatasetId(savedId);
                } else if (!savedId || !exists) {
                    setSelectedDatasetId(data[0].id);
                }
            }
        } catch (error) {
            console.error('Failed to load datasets:', error);
        }
    };

    const loadSuggestions = async (sessionId: string) => {
        try {
            const data = await chatService.getInitialSuggestions(sessionId);
            setInitialSuggestions(data || []);
        } catch (error) {
            console.error('Failed to load initial suggestions:', error);
            setInitialSuggestions([]);
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
            setSelectedDatasetId(session.dataset_id || '');
            const msgs = await chatService.getMessages(sessionId);
            setMessages(msgs);
            if (window.innerWidth < 768) setIsSidebarOpen(false);
            loadSuggestions(session.id);
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
                setInitialSuggestions([]);
            }
        } catch (error) {
            console.error('Failed to delete session:', error);
        }
    };

    const handleNewChat = () => {
        setCurrentSessionId(null);
        setMessages([]);
        setInitialSuggestions([]);
        if (window.innerWidth < 768) setIsSidebarOpen(false);
    };

    useEffect(() => {
        const loadSuggestionsForSelected = async () => {
            if (selectedVersionId) {
                if (currentSessionId) {
                    loadSuggestions(currentSessionId);
                } else {
                    try {
                        const sug = await chatService.getInitialSuggestionsByVersion(selectedVersionId);
                        setInitialSuggestions(sug || []);
                    } catch (error) {
                        console.error('Failed to load suggestions by version:', error);
                        setInitialSuggestions([]);
                    }
                }
            }
        };
        loadSuggestionsForSelected();
    }, [selectedVersionId, currentSessionId]);

    const handleDownloadCSV = (data: any, title: string) => {
        const rows = Array.isArray(data?.data?.rows) ? data.data.rows : (Array.isArray(data?.rows) ? data.rows : (Array.isArray(data?.data) ? data.data : []));
        if (rows.length === 0) return;
        const headers = Object.keys(rows[0]).join(',');
        const csvRows = rows.map((row: any) => Object.values(row).map(val => `"${val}"`).join(','));
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...csvRows].join('\\n');
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
        if (!source.includes('xmlns="http://www.w3.org/2000/svg"')) {
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

    const handleSendMessage = async (text: string, options?: { forceDeepAnalysis?: boolean; enableSuggestions?: boolean }) => {
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
        if (sessionId && currentSession && (currentSession.dataset_id || '') !== selectedDatasetId) {
            sessionId = null;
            setCurrentSessionId(null);
        }

        if (!sessionId) {
            try {
                const title = text.length > 30 ? text.substring(0, 30) + '...' : text;
                const newSession = await chatService.createSession(selectedDatasetId, selectedVersionId || undefined, title);
                sessionId = newSession.id;
                setCurrentSessionId(sessionId);
                loadSessions();
                loadSuggestions(sessionId);
            } catch (error) {
                console.error('Failed to create new session:', error);
                return;
            }
        }

        const tempId = Date.now().toString();
        const userMsg: ChatMessage = { id: tempId, role: 'user', content: text, sequence: messages.length + 1 };
        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);
        setError(null);
        abortControllerRef.current = new AbortController();

        try {
            let response;
            // Reset thought tracking
            setThoughtSteps([]);
            currentThoughtStepsRef.current = [];

            if (options?.forceDeepAnalysis) {
                setThinkProgress({
                    step: 1,
                    total: 6,
                    phase: 'classifying',
                    detail: 'Analyzing your question...'
                });
            }

            response = await chatService.sendMessageStream(
                sessionId,
                text,
                (progress) => {
                    setThinkProgress(progress);
                },
                (thought) => {
                    currentThoughtStepsRef.current = [...currentThoughtStepsRef.current, thought];
                    setThoughtSteps(prev => [...prev, thought]);
                },
                abortControllerRef.current.signal,
                options
            );
            setMessages(prev => {
                const filtered = prev.filter(m => m.id !== tempId);
                const assistantMsg = { ...response.assistant_message };
                if (currentThoughtStepsRef.current.length > 0) {
                    assistantMsg.output_data = {
                        ...(assistantMsg.output_data || {}),
                        thought_process: currentThoughtStepsRef.current,
                    };
                }
                return [...filtered, response.user_message, assistantMsg];
            });
            setInitialSuggestions([]);

            const isKpi = response.assistant_message.output_data?.type === 'kpi' || response.assistant_message.output_data?.chart?.type === 'kpi';
            if (hasRenderableOutput(response.assistant_message.output_data) && !isKpi) {
                setSelectedArtifactId(response.assistant_message.id);
                setIsArtifactVisible(true);
            }
        } catch (error: any) {
            if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') return;
            setError('Sorry, I encountered an error responding to your request.');
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: 'Sorry, I encountered an error responding to your request.',
                sequence: prev.length + 1,
                intent_type: 'error'
            }]);
        } finally {
            setIsTyping(false);
            setThinkProgress(null);
        }
    };

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setIsTyping(false);
        }
    };

    const submitDraftMessage = () => {
        const next = draftMessage.trim();
        if (!next || isTyping) return;
        setDraftMessage('');
        handleSendMessage(next);
    };

    const handleExecuteEditedSql = async (msgId: string, sqlOverride?: string) => {
        const sqlText = (sqlOverride ?? editingSql[msgId] ?? '').trim();
        if (!sqlText || !selectedDatasetId) return;

        setExecutingSql(prev => ({ ...prev, [msgId]: true }));
        setSqlError(prev => ({ ...prev, [msgId]: null }));
        setShowSql(prev => ({ ...prev, [msgId]: true }));

        try {
            const response = await chatService.executeSql(selectedDatasetId, sqlText);
            if (response.error) {
                setSqlError(prev => ({ ...prev, [msgId]: response.error }));
                return;
            }

            const rows: any[] = response.results || [];
            const columns: string[] = response.columns || [];
            const rowCount: number = response.row_count ?? rows.length;

            setMessages(prev => prev.map(m => {
                if (m.id !== msgId) return m;
                const newOutput = { ...(m.output_data || {}) };
                newOutput.sql = sqlText;

                const existingChart = newOutput.chart;
                if (existingChart && existingChart.type !== 'table') {
                    const canRefreshInPlace =
                        existingChart.type !== 'kpi'
                        && Array.isArray(columns)
                        && columns.length >= 1
                        && rows.length <= 5000;

                    if (canRefreshInPlace) {
                        existingChart.data = {
                            ...(existingChart.data || {}),
                            rows,
                            columns,
                        };
                        existingChart.title = existingChart.title || `Custom Query (${rowCount} rows)`;
                        newOutput.chart = existingChart;
                    } else {
                        newOutput.chart = {
                            type: 'table',
                            title: `Custom Query Results (${rowCount} rows)`,
                            data: { rows, columns },
                        };
                        setChartModes(prev => ({ ...prev, [msgId]: 'table' }));
                    }
                } else if (existingChart && existingChart.type === 'table') {
                    existingChart.data = { rows, columns };
                    existingChart.title = existingChart.title || `Custom Query Results (${rowCount} rows)`;
                    newOutput.chart = existingChart;
                } else {
                    newOutput.type = 'table';
                    newOutput.data = { rows, columns };
                    newOutput.title = `Custom Query Results (${rowCount} rows)`;
                }

                return { ...m, output_data: newOutput };
            }));

            setEditingSql(prev => ({ ...prev, [msgId]: sqlText }));
            setIsEditingSqlMode(prev => ({ ...prev, [msgId]: false }));
        } catch (err: any) {
            console.error("Execute SQL failed:", err);
            const detail = err?.response?.data?.detail || err?.message || "SQL Execution Error";
            setSqlError(prev => ({ ...prev, [msgId]: detail }));
        } finally {
            setExecutingSql(prev => ({ ...prev, [msgId]: false }));
        }
    };

    const renderArtifactViewer = () => {
        if (!activeArtifactMessage || !activeArtifactPayload) return null;

        const msg = activeArtifactMessage;
        const targetData = activeArtifactPayload;
        const isTableMode = chartModes[msg.id] === 'table';
        const confidenceValue = typeof targetData?.confidence === 'number'
            ? `${(targetData.confidence * 100).toFixed(1)}%`
            : null;

        return (
            <aside
                className={`flex flex-col bg-background relative z-10 ${isFullScreenArtifact ? 'fixed inset-0 z-[100]' : 'hidden md:flex'}`}
                style={!isFullScreenArtifact && !isMobile ? { width: `${artifactWidthPct}%` } : undefined}
            >
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Artifact</span>
                        <span className="truncate text-[12.5px] font-semibold">
                            {targetData?.title || targetData?.chart?.title || 'Data analysis'}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="flex items-center rounded-md border border-border bg-surface-2 p-0.5">
                            <button
                                onClick={() => setChartModes(prev => ({ ...prev, [msg.id]: 'chart' }))}
                                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] ${!isTableMode ? 'bg-surface-3 text-foreground' : 'text-muted-foreground'}`}
                            >
                                <BarChart3 className="h-3 w-3" />Chart
                            </button>
                            <button
                                onClick={() => setChartModes(prev => ({ ...prev, [msg.id]: 'table' }))}
                                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] ${isTableMode ? 'bg-surface-3 text-foreground' : 'text-muted-foreground'}`}
                            >
                                <TableIcon className="h-3 w-3" />Data
                            </button>
                        </div>
                        <BtnGhost onClick={() => handleDownloadCSV(targetData, targetData?.title || 'data')}><Download className="h-3 w-3" /></BtnGhost>
                        {targetData?.type !== 'kpi' && !isTableMode && (
                            <BtnGhost onClick={() => handleDownloadImage(msg.id, targetData?.title || 'chart')}><Copy className="h-3 w-3" /></BtnGhost>
                        )}
                        <BtnGhost onClick={() => setIsFullScreenArtifact(!isFullScreenArtifact)}><Maximize2 className="h-3 w-3" /></BtnGhost>
                        <BtnGhost onClick={() => { setSelectedArtifactId(null); setIsArtifactVisible(false); }}><PanelRightClose className="h-3 w-3" /></BtnGhost>
                    </div>
                </div>
                <div className="flex-1 overflow-auto p-5">
                    <Panel>
                        <PanelHeader
                            title={targetData?.title || targetData?.chart?.title || 'Result'}
                            subtitle={`${activeDatasetName || 'Dataset'}${confidenceValue ? ` · ${confidenceValue} confidence` : ''}`}
                        />
                        <div className="vizzy-chart-container min-h-[340px] p-4">
                            <ChartRenderer
                                type={isTableMode ? 'table' : (targetData?.type || 'unknown')}
                                data={targetData}
                                title={targetData?.title || targetData?.chart?.title}
                                currency={targetData?.currency}
                                variant="minimal"
                            />
                        </div>
                        <div className="border-t border-border px-4 py-2 text-[10.5px] text-muted-foreground">
                            Generated from live analysis
                        </div>
                    </Panel>
                    {targetData?.sql && (
                        <Panel className="mt-3">
                            <PanelHeader
                                title="Generated SQL"
                                subtitle="NL2SQL query"
                            />
                            <div className="p-4 pt-3">
                                <SqlEditor
                                    messageId={msg.id}
                                    sql={targetData.sql}
                                    variant="panel"
                                    onExecute={async (next) => {
                                        setEditingSql(prev => ({ ...prev, [msg.id]: next }));
                                        await handleExecuteEditedSql(msg.id, next);
                                    }}
                                />
                            </div>
                        </Panel>
                    )}
                    <div className="mt-3 flex justify-end gap-2">

                        <BtnAccent onClick={() => {
                            const title = targetData?.title || targetData?.chart?.title || 'Data Analysis';
                            const sqlPart = targetData?.sql ? ` SQL: ${targetData.sql}.` : '';
                            const dataObj = targetData?.data || targetData?.chart?.data;
                            const dataPart = dataObj ? ` Data: ${JSON.stringify(dataObj).substring(0, 800)}.` : '';
                            handleSendMessage(`Explain this result further: "${title}".${sqlPart}${dataPart}`);
                        }}>
                            <Sparkles className="h-3 w-3" />Explain further
                        </BtnAccent>
                    </div>
                </div>
            </aside>
        );
    };

    const renderHistoryList = () => (
        <>
            <div className="flex items-center justify-between px-3 py-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsSidebarOpen(false)}
                        className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                        title="Close sidebar"
                    >
                        <PanelLeftClose className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sessions</span>
                </div>
                <button
                    type="button"
                    onClick={handleNewChat}
                    className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                    title="New analysis"
                >
                    <Plus className="h-3.5 w-3.5" />
                </button>
            </div>
            <div className="flex-1 overflow-auto px-2">
                {[{ label: 'Today', items: groupedSessions.today }, { label: 'Yesterday', items: groupedSessions.yesterday }, { label: 'Previous', items: groupedSessions.previous }].map((group) => {
                    if (!group.items.length) return null;
                    return (
                        <div key={group.label}>
                            <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
                            {group.items.map(session => (
                                <button
                                    key={session.id}
                                    type="button"
                                    className={`group mb-0.5 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-[12px] transition ${currentSessionId === session.id ? 'bg-surface-3 text-foreground' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'}`}
                                    onClick={() => loadSession(session.id)}
                                >
                                    <MessageSquare className="mt-0.5 h-3 w-3 text-muted-foreground" />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate font-medium">{session.title || 'Untitled Chat'}</div>
                                        <div className="text-[10.5px] text-muted-foreground">{session.message_count} messages</div>
                                    </div>
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => handleDeleteSession(e as unknown as React.MouseEvent, session.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') handleDeleteSession(e as unknown as React.MouseEvent, session.id);
                                        }}
                                        className="rounded p-1 text-muted-foreground opacity-0 hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                                        title="Delete session"
                                    >
                                        <X className="h-3 w-3" />
                                    </span>
                                </button>
                            ))}
                        </div>
                    );
                })}
                {sessions.length === 0 && (
                    <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                        No recent chats
                    </div>
                )}
            </div>
        </>
    );

    const renderMessageContent = (msg: ChatMessage) => {
        if (isInsightMessage(msg)) {
            const insightSqlQueries = getInsightSqlQueries(msg);
            return (
                <div className="space-y-4 w-full">
                    <div className="markdown-content text-foreground/90">{renderInsightPoints(msg.content)}</div>
                    {insightSqlQueries.length > 0 && (
                        <div className="rounded-md border border-border bg-surface-2">
                            <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                                <span className="font-mono text-[10.5px] text-muted-foreground">Insight SQL</span>
                                <Pill tone="info">{insightSqlQueries.length} queries</Pill>
                            </div>
                            <div className="space-y-3 p-3">
                                {insightSqlQueries.map((item, idx) => {
                                    const copyKey = `${msg.id}::insight-sql::${item.id}`;
                                    return (
                                        <div key={copyKey} className="rounded-md border border-border bg-background">
                                            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                                                <span className="truncate text-xs font-semibold">#{idx + 1} {item.title}</span>
                                                <BtnGhost onClick={() => { navigator.clipboard.writeText(item.sql); setCopiedSqlMsgId(copyKey); setTimeout(() => setCopiedSqlMsgId(null), 2000); }}>
                                                    {copiedSqlMsgId === copyKey ? <><Check className="h-3 w-3" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
                                                </BtnGhost>
                                            </div>
                                            <pre className="overflow-auto p-3 font-mono text-[11.5px] leading-relaxed text-foreground/90"><code>{item.sql}</code></pre>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        if (['analysis', 'visualization', 'dashboard', 'comparative', 'aggregative', 'trend', 'text_query', 'clarification'].includes(msg.intent_type || '')) {
            return (
                <div className="markdown-content text-[13px] leading-relaxed text-foreground/90">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    {hasRenderableOutput(msg.output_data) && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            <button
                                onClick={() => { setSelectedArtifactId(msg.id); setIsArtifactVisible(true); }}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[11px] hover:bg-surface-2"
                            >
                                <BarChart3 className="h-3 w-3" />View artifact
                            </button>
                            {msg.output_data?.sql && (
                                <button
                                    onClick={() => setShowSql(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[11px] hover:bg-surface-2"
                                >
                                    <Code2 className="h-3 w-3" />{showSql[msg.id] ? 'Hide SQL' : 'View SQL'}
                                </button>
                            )}
                            <Pill tone="accent"><BarChart3 className="h-2.5 w-2.5" />Artifact attached</Pill>
                            <BtnGhost onClick={() => handleSendMessage('Refine this result')}><Wand2 className="h-3 w-3" />Refine</BtnGhost>
                        </div>
                    )}
                    {msg.output_data?.sql && showSql[msg.id] && (
                        <div className="mt-3 rounded-md border border-border bg-surface-2">
                            <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                                <span className="font-mono text-[10.5px] text-muted-foreground">generated.sql · NL2SQL</span>
                                <BtnGhost onClick={() => { navigator.clipboard.writeText(msg.output_data.sql); setCopiedSqlMsgId(msg.id); setTimeout(() => setCopiedSqlMsgId(null), 1500); }}>
                                    {copiedSqlMsgId === msg.id ? <><Check className="h-3 w-3" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
                                </BtnGhost>
                            </div>
                            <pre className="overflow-auto p-3 font-mono text-[11.5px] leading-relaxed text-foreground/90"><code>{msg.output_data.sql}</code></pre>
                        </div>
                    )}
                </div>
            );
        }

        return <div className="text-[13px] leading-relaxed text-foreground/90 whitespace-pre-wrap">{msg.content}</div>;
    };
    return (
        <div ref={splitContainerRef} className="flex h-[calc(100vh-85px)] overflow-hidden bg-background text-foreground font-display antialiased relative selection:bg-primary selection:text-white">
            {messages.length > 0 && (
                <>
                    <div className="absolute inset-0 z-0 transition-all duration-700 invert hue-rotate-180 opacity-60 dark:invert-0 dark:hue-rotate-0 dark:opacity-100" style={{ backgroundImage: "url('https://pub-940ccf6255b54fa799a9b01050e6c227.s3.amazonaws.com/ruixen_moon_2.png')", backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }} />
                    <div className="absolute inset-0 bg-background/70 backdrop-blur-2xl z-0 transition-opacity duration-700"></div>
                </>
            )}
            <div className="grain-overlay z-0 relative pointer-events-none"></div>
            <div className={`hidden md:flex ${isSidebarOpen ? 'w-72' : 'w-0'} bg-surface/70 backdrop-blur-xl border-r border-border/30 transition-all duration-300 flex-col flex-shrink-0 overflow-hidden relative z-10`}>
                {renderHistoryList()}
            </div>
            {isSidebarOpen && (
                <>
                    <div className="md:hidden fixed inset-0 bg-black/50 z-20" onClick={() => setIsSidebarOpen(false)} />
                    <div className="md:hidden fixed inset-y-0 left-0 w-72 bg-surface/70 backdrop-blur-xl border-r border-border/30 z-30 flex flex-col">
                        {renderHistoryList()}
                    </div>
                </>
            )}
            <div className="flex-1 flex flex-col h-full overflow-hidden relative z-10" style={{ minWidth: 0 }}>
                {!isSidebarOpen && (
                    <div className="absolute left-4 top-4 z-20">
                        <BtnGhost onClick={() => setIsSidebarOpen(true)} className="h-9 px-3 bg-surface border border-border/40 rounded-xl text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
                            <PanelLeft className="h-3.5 w-3.5" />
                            <span className="ml-1 text-[11px] uppercase tracking-wider">History</span>
                        </BtnGhost>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto w-full min-h-0">
                    {messages.length === 0 ? (
                        <RuixenMoonChat 
                            onSendMessage={handleSendMessage} 
                            datasets={datasets} 
                            selectedDatasetId={selectedDatasetId} 
                            onDatasetChange={(id) => {
                                setSelectedDatasetId(id);
                                if (messages.length === 0) {
                                    setCurrentSessionId(null);
                                }
                            }}
                            versions={versions}
                            selectedVersionId={selectedVersionId}
                            onVersionChange={(id) => {
                                setSelectedVersionId(id);
                                if (messages.length === 0) {
                                    setCurrentSessionId(null);
                                }
                            }}
                            suggestions={initialSuggestions}
                        />
                    ) : (
                        <div className="p-6 md:p-10 space-y-8 max-w-5xl mx-auto w-full">
                            {error && (
                                <div className="mx-auto max-w-xl">
                                    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                                        <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                            <h4 className="text-sm font-semibold text-destructive">Chat Error</h4>
                                            <p className="text-sm text-muted-foreground mt-1">{error}</p>
                                        </div>
                                        <button onClick={() => setError(null)} className="rounded p-1 hover:bg-destructive/10"><X className="h-4 w-4 text-destructive" /></button>
                                    </div>
                                </div>
                            )}
                            {messages.map((msg) => {
                                const isKpi = msg.output_data?.type === 'kpi' || msg.output_data?.chart?.type === 'kpi';
                                const chartType = msg.output_data?.chart?.type;
                                const intent = (msg.intent_type || '').toLowerCase();
                                
                                let transitionText = "Based on the query execution and data retrieval, here is the analysis:";
                                if (isKpi) {
                                    transitionText = "Based on the query execution and data retrieval, here is the metric you requested:";
                                } else if (intent === 'trend' || chartType === 'line') {
                                    transitionText = "Based on the query execution and data retrieval, here is the trend analysis:";
                                } else if (intent === 'comparative' || chartType === 'bar' || chartType === 'pie' || chartType === 'stacked_bar') {
                                    transitionText = "Based on the query execution and data retrieval, here is the comparative analysis:";
                                }

                                const isDetailed = (msg.content || '').includes('\n') || (msg.content || '').includes('•') || (msg.content || '').includes('-') || (msg.content || '').length > 150;
                                const shouldRestrictWidth = msg.role === 'assistant' && isKpi && !isDetailed;

                                return (
                                    <div key={msg.id} id={`msg-${msg.id}`} className={`flex w-full mb-8 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-7xl w-full flex items-start space-x-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                            {msg.role === 'assistant' && (
                                                <div className="w-10 h-10 rounded-xl bg-white dark:bg-black border border-border flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden">
                                                    <VizzyPilotLogoIcon size={34} />
                                                </div>
                                            )}
                                            <div className={`px-5 py-4 rounded-xl border ${msg.role === 'user' ? 'bg-surface-3 text-foreground border-border shadow-sm max-w-xl ml-auto' : 'bg-surface-2 text-foreground border-border w-full'} ${shouldRestrictWidth ? 'max-w-md mr-auto' : ''}`}>
                                                {msg.role === 'assistant' && (msg.output_data?.type === 'interpretive_text' || msg.output_data?.source === 'orchestrator_interpretive') && (
                                                    <div className="mb-2 flex items-center">
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-[#8B5CF6]/15 text-[#8B5CF6] border border-[#8B5CF6]/30">
                                                            <BrainCog className="h-3 w-3" /> Deep Analysis
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="chat-insight-container text-sm leading-relaxed">
                                                    {/* Persistent Thought Process Toggle - Rendered at the TOP of the reply */}
                                                    {msg.role === 'assistant' && msg.output_data?.thought_process && msg.output_data.thought_process.length > 0 && (() => {
                                                        const isExpanded = expandedThoughts[msg.id] !== false;
                                                        return (
                                                            <div className="mb-3.5 border-l-2 border-border/40 pl-3.5 ml-1 bg-transparent">
                                                                <button
                                                                    onClick={() => setExpandedThoughts(prev => ({ ...prev, [msg.id]: isExpanded ? false : true }))}
                                                                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none py-1"
                                                                >
                                                                    {isExpanded ? (
                                                                        <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
                                                                    ) : (
                                                                        <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
                                                                    )}
                                                                    <Sparkles className="h-3 w-3 text-muted-foreground/45" />
                                                                    <span className="font-medium">Thought process</span>
                                                                    <span className="text-[10px] text-muted-foreground/50 font-mono">({msg.output_data.thought_process.length} steps)</span>
                                                                </button>
                                                                {isExpanded && (
                                                                    <div className="mt-2 space-y-2 pl-2 border-l border-border/20 ml-1.5 py-0.5 animate-fade-in">
                                                                        {msg.output_data.thought_process.map((step: any) => (
                                                                            <div key={step.id} className="flex items-start gap-2.5 text-xs text-muted-foreground/75">
                                                                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/35 mt-1.5 shrink-0" />
                                                                                <span className="leading-relaxed font-sans">{step.content}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* Professional Analyst Transition Line */}
                                                    {msg.role === 'assistant' && msg.output_data?.thought_process && msg.output_data.thought_process.length > 0 && (
                                                        <div className="text-xs font-semibold text-muted-foreground/80 pl-1 mb-3.5 tracking-wide select-none">
                                                            {transitionText}
                                                        </div>
                                                    )}

                                                {isInsightMessage(msg) ? (
                                                    (() => {
                                                        const insightSqlQueries = getInsightSqlQueries(msg);
                                                        return (
                                                            <div className="space-y-4 w-full">
                                                                <div className="chat-insight-container text-themed-main">{renderInsightPoints(msg.content)}</div>
                                                                {insightSqlQueries.length > 0 && (
                                                                    <div className="rounded-sm border border-border-main bg-bg-main/40">
                                                                        <div className="flex items-center justify-between px-3 py-2 border-b border-border-main/70">
                                                                            <div className="flex items-center gap-2.5">
                                                                                <span className="text-[10px] font-semibold font-mono tracking-[0.16em] uppercase text-themed-muted">Insight SQL</span>
                                                                                <span className="text-[10px] font-medium font-mono tracking-widest uppercase px-2 py-0.5 rounded-sm bg-primary/15 text-primary border border-primary/30">{insightSqlQueries.length} queries</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="px-3 py-3 space-y-3">
                                                                            {insightSqlQueries.map((item, idx) => {
                                                                                const copyKey = `${msg.id}::insight-sql::${item.id}`;
                                                                                return (
                                                                                    <div key={copyKey} className="rounded-sm border border-border-main/70 bg-bg-card/70">
                                                                                        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border-main/70">
                                                                                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                                                                                                <span className="text-[10px] font-medium font-mono tracking-widest uppercase px-1.5 py-0.5 rounded-sm bg-bg-main/70 text-themed-muted border border-border-main/70">#{idx + 1}</span>
                                                                                                <span className="text-xs font-semibold text-themed-main truncate">{item.title}</span>
                                                                                                {item.dimension && <span className="text-[10px] font-medium font-mono tracking-widest uppercase px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary border border-primary/20">{item.dimension}</span>}
                                                                                                {typeof item.row_count === 'number' && <span className="text-[10px] font-medium font-mono tracking-widest uppercase px-1.5 py-0.5 rounded-sm bg-bg-main/70 text-themed-muted border border-border-main/70">{item.row_count} rows</span>}
                                                                                            </div>
                                                                                            <BtnGhost onClick={() => { navigator.clipboard.writeText(item.sql); setCopiedSqlMsgId(copyKey); setTimeout(() => setCopiedSqlMsgId(null), 2000); }} className="text-[10px] font-mono font-semibold tracking-widest uppercase text-themed-muted hover:text-primary transition-colors flex items-center gap-1 flex-shrink-0">
                                                                                                {copiedSqlMsgId === copyKey ? <><Check className="h-3 w-3" /> Copied!</> : <><Copy className="h-3 w-3" /> Copy</>}
                                                                                            </BtnGhost>
                                                                                        </div>
                                                                                        <pre className="mx-3 my-3 p-3 bg-bg-card border border-border-main/70 rounded-sm text-xs font-mono text-primary overflow-x-auto whitespace-pre-wrap leading-relaxed"><code>{item.sql}</code></pre>
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
                                                    <div className="chat-insight-container text-sm leading-relaxed">
                                                        {renderAnalysisInsight(msg)}
                                                        {msg.output_data?.type === 'clarification' && msg.output_data?.ambiguity && (
                                                            <div className="mt-3.5 space-y-2">
                                                                <div className="flex flex-wrap gap-2">
                                                                    {msg.output_data.ambiguity.candidates?.map((c: any, cIdx: number) => (
                                                                        <button
                                                                            key={cIdx}
                                                                            onClick={() => {
                                                                                const term = msg.output_data.ambiguity.term;
                                                                                const originalQuery = msg.output_data.ambiguity.original_query || "";
                                                                                const chosenColumn = c.column;
                                                                                const newQuery = `For my query "${originalQuery}", I meant column "${chosenColumn}" instead of "${term}"`;
                                                                                handleSendMessage(newQuery);
                                                                            }}
                                                                            className="px-3 py-1.5 rounded-lg border border-border bg-surface-3 hover:bg-primary/10 hover:border-primary/40 text-xs font-semibold text-foreground transition-all duration-200 cursor-pointer"
                                                                        >
                                                                            {c.column}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {hasRenderableOutput(msg.output_data) && (() => {
                                                             const isKpi = msg.output_data?.type === 'kpi' || msg.output_data?.chart?.type === 'kpi';
                                                             return (
                                                                 <>
                                                                     <div className="mt-4 flex flex-wrap items-center gap-2">
                                                                         {!isKpi && (
                                                                             <BtnGhost onClick={() => { setSelectedArtifactId(msg.id); setIsArtifactVisible(true); }} className="flex items-center gap-1.5 text-xs">
                                                                                 <BarChart3 className="h-3 w-3" /> View Visualization
                                                                             </BtnGhost>
                                                                         )}
                                                                         {msg.output_data?.sql && (
                                                                             <BtnGhost onClick={() => setShowSql(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))} className="flex items-center gap-1.5 text-xs">
                                                                                 <Code2 className="h-3 w-3" /> {showSql[msg.id] ? 'Hide' : 'View'} SQL
                                                                             </BtnGhost>
                                                                         )}
                                                                         {!isKpi && (
                                                                             <BtnGhost onClick={() => handleDownloadCSV(msg.output_data, msg.id)} className="flex items-center gap-1.5 text-xs">
                                                                                 <Download className="h-3 w-3" /> CSV
                                                                             </BtnGhost>
                                                                         )}
                                                                     </div>
                                                                     {msg.output_data?.sql && showSql[msg.id] && (
                                                                         <SqlEditor
                                                                             messageId={msg.id}
                                                                             sql={msg.output_data.sql}
                                                                             variant="inline"
                                                                             className="mt-3"
                                                                             onExecute={async (next) => {
                                                                                 setEditingSql(prev => ({ ...prev, [msg.id]: next }));
                                                                                 await handleExecuteEditedSql(msg.id, next);
                                                                             }}
                                                                         />
                                                                     )}
                                                                 </>
                                                             );
                                                         })()}
                                                    </div>
                                                ) : (
                                                    <div className="text-sm leading-relaxed">{msg.content}</div>
                                                )}
                                            </div>
                                            {msg.role === 'assistant' && msg.output_data?.followup_suggestions && msg.output_data.followup_suggestions.length > 0 && (
                                                <div className="mt-4 flex flex-wrap gap-2 animate-fade-in border-t border-border/20 pt-3">
                                                    {msg.output_data.followup_suggestions.map((suggestion: string, sIdx: number) => (
                                                        <button
                                                            key={sIdx}
                                                            onClick={() => handleSendMessage(suggestion, { enableSuggestions: true })}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#1EAEDB]/20 bg-[#1EAEDB]/5 hover:bg-[#1EAEDB]/15 hover:border-[#1EAEDB]/45 text-xs font-medium text-[#1EAEDB] transition-all duration-200 cursor-pointer shadow-sm active:scale-[0.98]"
                                                        >
                                                            <Globe className="h-3.5 w-3.5" />
                                                            {suggestion}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                            {isTyping && (
                                <div className="flex gap-3 animate-fade-in">
                                    <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-3 border border-border text-foreground">
                                        <Sparkles className="h-3.5 w-3.5 animate-pulse text-muted-foreground/70" />
                                    </div>
                                    <div className="flex-1 max-w-lg mt-1">
                                        {/* Active Thinking Component */}
                                        <div className="border-l-2 border-primary/50 pl-3.5 ml-1 bg-transparent space-y-3">
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground/90 font-medium select-none">
                                                <BrainCog className="h-3.5 w-3.5 text-primary/70 animate-spin [animation-duration:4s]" />
                                                <span>Thinking...</span>
                                                <span className="text-[10px] text-muted-foreground/50 font-mono ml-auto">
                                                    {thoughtSteps.length > 0 ? `${thoughtSteps.length} steps` : ''}
                                                </span>
                                            </div>
                                            {thoughtSteps.length > 0 && (
                                                <div className="space-y-2 max-h-[220px] overflow-y-auto pl-2 border-l border-border/20 ml-1.5 py-0.5">
                                                    {thoughtSteps.map((step) => (
                                                        <div
                                                            key={step.id}
                                                            className="flex items-start gap-2.5 text-xs text-muted-foreground/75 animate-fade-in"
                                                        >
                                                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/35 mt-1.5 shrink-0" />
                                                            <span className="leading-relaxed font-sans">{step.content}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {thinkProgress && (
                                                <div className="pt-1.5 space-y-2 max-w-md">
                                                    <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground/80 pl-2">
                                                        <span className="flex items-center gap-1">
                                                            <BrainCog className="h-3 w-3 animate-spin [animation-duration:3s] text-primary/70" />
                                                            {thinkProgress.detail}
                                                        </span>
                                                        <span className="font-mono">
                                                            {thinkProgress.step}/{thinkProgress.total}
                                                        </span>
                                                    </div>
                                                    <div className="h-1 w-full bg-surface-3 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-primary to-[#1EAEDB] transition-all duration-500 ease-out rounded-full"
                                                            style={{ width: `${(thinkProgress.step / thinkProgress.total) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>
                {messages.length > 0 && (
                <div className="border-t border-border bg-background p-4">
                    <div className="mx-auto max-w-[680px]">
                        <PromptInputBox 
                            onSend={(msg, files, options) => handleSendMessage(msg, options)}
                            placeholder={`Ask anything about ${activeDatasetName || 'your data'}...`}
                            isLoading={isTyping}
                        />
                        <div className="mt-2 flex items-center gap-2 px-1 text-[10.5px] text-muted-foreground">
                            <span className="flex items-center gap-1"><Database className="h-2.5 w-2.5" />Context: {activeDatasetName || 'None selected'}</span>
                            <span className="text-border">·</span>
                            <span>Press Enter to send · Shift+Enter for newline</span>
                        </div>
                    </div>
                </div>
                )}
            </div>
            {renderArtifactViewer()}
        </div>
    );
}
