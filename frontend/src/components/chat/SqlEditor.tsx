import { useState, useCallback, useEffect, useRef } from 'react';
import { Code2, Copy, Check, Play, X, AlertCircle } from 'lucide-react';

export interface SqlEditorProps {
    messageId: string;
    sql: string;
    onExecute: (sql: string) => Promise<void>;
    variant?: 'panel' | 'inline';
    className?: string;
    defaultEditing?: boolean;
}

export function SqlEditor({
    messageId,
    sql,
    onExecute,
    variant = 'panel',
    className = '',
    defaultEditing = false,
}: SqlEditorProps) {
    const [isEditing, setIsEditing] = useState<boolean>(defaultEditing);
    const [draft, setDraft] = useState<string>(sql);
    const [isExecuting, setIsExecuting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const lastSqlRef = useRef<string>(sql);
    if (lastSqlRef.current !== sql) {
        lastSqlRef.current = sql;
        setDraft(sql);
        setError(null);
    }

    const startEdit = useCallback(() => {
        setDraft(sql);
        setError(null);
        setIsEditing(true);
    }, [sql]);

    const cancelEdit = useCallback(() => {
        setDraft(sql);
        setError(null);
        setIsEditing(false);
    }, [sql]);

    const runQuery = useCallback(async () => {
        const next = (draft ?? '').trim();
        if (!next) {
            setError('SQL is empty.');
            return;
        }
        setIsExecuting(true);
        setError(null);
        try {
            await onExecute(draft);
            setIsEditing(false);
        } catch (err: any) {
            const detail = err?.response?.data?.detail || err?.message || 'SQL execution failed.';
            setError(detail);
        } finally {
            setIsExecuting(false);
        }
    }, [draft, onExecute]);

    const copySql = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(sql);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* clipboard denied — non-fatal */
        }
    }, [sql]);

    const isPanel = variant === 'panel';
    const shellClass = isPanel
        ? `mt-3 rounded-md border border-border bg-surface-2 ${className}`
        : `rounded-md border border-border bg-surface-2 ${className}`;
    const headerPad = isPanel ? 'px-4 py-2' : 'px-3 py-1.5';
    const bodyPad = isPanel ? 'p-4' : 'p-3';
    const headerLabel = isPanel ? 'Generated SQL · NL2SQL' : 'generated.sql · NL2SQL';
    const labelSize = isPanel ? 'text-[10.5px]' : 'text-[10.5px]';

    return (
        <div className={shellClass} data-message-id={messageId} data-testid="sql-editor">
            <div className={`flex items-center justify-between border-b border-border ${headerPad}`}>
                <span className={`font-mono ${labelSize} text-muted-foreground`}>{headerLabel}</span>
                <div className="flex items-center gap-1">
                    {!isEditing && (
                        <button
                            type="button"
                            onClick={startEdit}
                            className="text-[10px] uppercase font-mono font-semibold tracking-widest text-muted-foreground hover:text-foreground hover:bg-surface-3 px-2 py-1 rounded transition"
                            data-testid="sql-edit-button"
                            aria-label="Edit SQL"
                        >
                            Edit
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={copySql}
                        className="text-[10px] uppercase font-mono font-semibold tracking-widest text-muted-foreground hover:text-foreground hover:bg-surface-3 px-2 py-1 rounded transition inline-flex items-center gap-1"
                        data-testid="sql-copy-button"
                        aria-label="Copy SQL"
                    >
                        {copied ? <><Check className="h-3 w-3" />Copied</> : <><Copy className="h-3 w-3" />Copy</>}
                    </button>
                </div>
            </div>

            <div className={bodyPad}>
                {isEditing ? (
                    <div className="space-y-3">
                        <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className={`w-full p-3 rounded-lg border border-border bg-surface-3 font-mono text-[11.5px] leading-relaxed text-foreground/90 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary ${isPanel ? 'min-h-[140px]' : 'min-h-[120px]'}`}
                            placeholder="SELECT * FROM data..."
                            data-testid="sql-textarea"
                            spellCheck={false}
                        />

                        {error && (
                            <div
                                className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg flex items-start gap-2"
                                role="alert"
                                data-testid="sql-error"
                            >
                                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={runQuery}
                                disabled={isExecuting}
                                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs transition hover:bg-primary/95 disabled:opacity-50 inline-flex items-center gap-1.5"
                                data-testid="sql-run-button"
                            >
                                {isExecuting ? (
                                    <>Executing…</>
                                ) : (
                                    <>
                                        <Play className="h-3 w-3" />
                                        Run Query
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={isExecuting}
                                className="px-3 py-1.5 rounded-lg bg-surface-3 text-foreground font-semibold text-xs border border-border hover:bg-surface-2 transition inline-flex items-center gap-1.5 disabled:opacity-50"
                                data-testid="sql-cancel-button"
                            >
                                <X className="h-3 w-3" />
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <pre className={`overflow-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed text-foreground/90 ${isPanel ? '' : 'border-0 bg-transparent p-0'}`}>
                        <code data-testid="sql-preview">{sql}</code>
                    </pre>
                )}
            </div>
        </div>
    );
}

export default SqlEditor;
