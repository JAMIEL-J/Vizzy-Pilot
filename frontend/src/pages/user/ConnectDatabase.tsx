import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, Database, Loader2, Lock, Server } from "lucide-react";
import { externalDbService, type DatabaseConnectionConfig } from "../../lib/api/external-db";
import { PageHeader } from "@/components/layout/TopNav";
import { Panel, PanelHeader, Pill, BtnSecondary, BtnPrimary } from "@/components/ui/primitive";

const providers = [
    { id: "postgresql", name: "PostgreSQL", desc: "OLTP relational database", active: true },
    { id: "snowflake", name: "Snowflake", desc: "Cloud data warehouse" },
    { id: "bigquery", name: "BigQuery", desc: "Google managed warehouse" },
    { id: "redshift", name: "Redshift", desc: "AWS warehouse" },
    { id: "mysql", name: "MySQL", desc: "OLTP relational database" },
    { id: "mongodb", name: "MongoDB", desc: "Document database" },
];

export default function ConnectDatabase() {
    const [config, setConfig] = useState<DatabaseConnectionConfig & { displayName: string }>({
        type: "postgresql",
        database: "",
        host: "",
        port: 5432,
        username: "",
        password: "",
        displayName: "",
    });

    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setConfig(prev => ({ ...prev, [name]: name === "port" ? parseInt(value) || "" : value }));
    };

    const handleProviderSelect = (type: DatabaseConnectionConfig["type"]) => {
        setConfig(prev => ({ ...prev, type }));
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            await externalDbService.testConnection(config);
            setTestResult({ success: true, message: "Successfully established a handshake with the database." });
        } catch (error: any) {
            console.error("Connection failed:", error);
            const errMsg = error?.response?.data?.message || error.message || "Connection failed. Please check your credentials.";
            setTestResult({ success: false, message: errMsg });
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb={["Datasets", "Connect source"]}
                title="Connect a database"
                description="Stream tables into Vizzy · credentials encrypted at rest with AES-256"
            />
            <div className="grid grid-cols-12 gap-4 px-5 py-4">
                {/* providers */}
                <Panel className="col-span-12 lg:col-span-4">
                    <PanelHeader title="Source" subtitle="Choose a provider" />
                    <div className="divide-y divide-border">
                        {providers.map(p => (
                            <button
                                key={p.id}
                                onClick={() => handleProviderSelect(p.id as DatabaseConnectionConfig["type"])}
                                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${config.type === p.id ? "bg-surface-2" : "hover:bg-surface-2/50"}`}
                            >
                                <div className="grid h-8 w-8 place-items-center rounded-md bg-surface-3">
                                    <Database className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-[12.5px] font-medium">{p.name}</div>
                                    <div className="text-[10.5px] text-muted-foreground">{p.desc}</div>
                                </div>
                                {config.type === p.id && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            </button>
                        ))}
                    </div>
                </Panel>

                {/* config */}
                <div className="col-span-12 lg:col-span-8 space-y-4">
                    <Panel>
                        <PanelHeader
                            title={`${providers.find(p => p.id === config.type)?.name || "Database"} connection`}
                            subtitle="Vizzy will create a read-only role automatically"
                            icon={<Server className="h-3.5 w-3.5" />}
                            actions={<Pill tone="info"><Lock className="h-2.5 w-2.5" />SSL required</Pill>}
                        />
                        
                        {/* Claude-style error display */}
                        {testResult && !testResult.success && !isTesting && (
                            <div className="mx-5 mt-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-[12.5px] text-destructive">
                                <div className="flex items-center gap-2 font-medium">
                                    <AlertCircle className="h-4 w-4" />
                                    Connection failed
                                </div>
                                <div className="mt-1 ml-6 text-destructive/80">
                                    {testResult.message}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 p-5">
                            <Field label="Display name" name="displayName" placeholder="Production replica" value={config.displayName} onChange={handleChange} full />
                            <Field label="Host" name="host" placeholder="db.production.acme.internal" value={config.host || ""} onChange={handleChange} full />
                            <Field label="Port" name="port" placeholder="5432" value={String(config.port || "")} onChange={handleChange} />
                            <Field label="Database" name="database" placeholder="analytics" value={config.database} onChange={handleChange} />
                            <Field label="Username" name="username" placeholder="vizzy_reader" value={config.username || ""} onChange={handleChange} />
                            <Field label="Password" name="password" placeholder="••••••••••••" value={config.password || ""} onChange={handleChange} type="password" />
                            <Field label="Schema (optional)" name="schema" placeholder="public" value={(config as any).schema || ""} onChange={handleChange} full />
                        </div>
                        <div className="flex items-center justify-between border-t border-border bg-surface-2/40 px-5 py-3">
                            <div className="flex items-center gap-2">
                                {testResult?.success && !isTesting && (
                                    <div className="flex items-center gap-2 text-[12px]">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                        <span className="font-medium text-success">Connection successful</span>
                                        <span className="text-muted-foreground">· 42 tables discovered · roundtrip 38ms</span>
                                    </div>
                                )}
                                {isTesting && (
                                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />Testing connection…
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <BtnSecondary onClick={handleTestConnection} disabled={isTesting}>
                                    Test connection
                                </BtnSecondary>
                                <BtnPrimary>Save & sync</BtnPrimary>
                            </div>
                        </div>
                    </Panel>

                    <Panel>
                        <PanelHeader title="Network & security" subtitle="Optional advanced configuration" />
                        <div className="grid grid-cols-3 gap-px bg-border">
                            {[
                                { label: "SSH tunnel", v: "Not configured" },
                                { label: "IP allowlist", v: "34.120.0.0/16" },
                                { label: "Sync cadence", v: "Every 15 min" },
                            ].map(x => (
                                <div key={x.label} className="bg-surface p-4">
                                    <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{x.label}</div>
                                    <div className="mt-1 text-[12.5px] font-medium">{x.v}</div>
                                </div>
                            ))}
                        </div>
                    </Panel>
                </div>
            </div>
        </div>
    );
}

function Field({
    label,
    name,
    placeholder,
    value,
    onChange,
    type = "text",
    full,
}: {
    label: string;
    name: string;
    placeholder: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string;
    full?: boolean;
}) {
    return (
        <div className={full ? "col-span-2" : ""}>
            <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">{label}</label>
            <input
                name={name}
                type={type}
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-[12.5px] outline-none transition focus:border-accent focus:ring-accent-soft"
            />
        </div>
    );
}
