import { useEffect, useMemo, useRef, useState } from 'react';
import { userApi, type UserProfileStats } from '../../lib/api/user';
import { X, Sparkles, Trophy, MessageSquare, Database, HardDrive, Zap } from "lucide-react";
import { PageHeader } from '../../components/layout/TopNav';
import { Panel, PanelHeader, Pill, BtnSecondary } from '../../components/ui/primitive';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  ChartTooltip,
  Legend
);

function Kpi({ label, value, sub, icon, accent }: { label: string; value: string | number; sub?: string; icon?: React.ReactNode; accent?: boolean }) {
  return (
    <div className="bg-background p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[10.5px] uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className={`num mt-2 text-display text-[24px] font-semibold ${accent ? "text-gradient" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">{label}</label>
      <input type={type} required={required} value={value} onChange={e => onChange(e.target.value)} className="h-9 w-full rounded-md border border-border bg-surface px-3 text-[12.5px] outline-none focus:border-accent" />
    </div>
  );
}

export default function UserProfile() {
    const [profile, setProfile] = useState<UserProfileStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [profileMessage, setProfileMessage] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ name: '', email: '' });
    const [isMilestoneDismissed, setIsMilestoneDismissed] = useState(false);
    const monthlySummaryRef = useRef<HTMLDivElement | null>(null);

    const milestoneStorageKey = useMemo(() => {
        return profile?.user?.id
            ? `vizzy.profile.milestone.dismissed.${profile.user.id}`
            : 'vizzy.profile.milestone.dismissed';
    }, [profile?.user?.id]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await userApi.getProfileStats();
                setProfile(data);
                setEditForm({
                    name: data.user.name || '',
                    email: data.user.email || '',
                });
            } catch (err: any) {
                setError(err?.response?.data?.detail || 'Failed to load profile analytics');
            } finally {
                setLoading(false);
            }
        };

        load();
    }, []);

    useEffect(() => {
        if (!profile) return;
        const dismissed = localStorage.getItem(milestoneStorageKey) === '1';
        setIsMilestoneDismissed(dismissed);
    }, [profile, milestoneStorageKey]);

    const kpis = useMemo(() => {
        if (!profile) return [];
        return [
            {
                label: 'Total Datasets',
                value: profile.totals.total_datasets,
                icon: <Database className="h-3 w-3" />
            },
            {
                label: 'Analyses Run',
                value: profile.totals.total_analyses,
                icon: <MessageSquare className="h-3 w-3" />
            },
            {
                label: 'Dashboards',
                value: profile.totals.total_dashboards_generated,
                icon: <HardDrive className="h-3 w-3" />
            },
            {
                label: 'Chat Sessions',
                value: profile.totals.total_chat_sessions,
                icon: <Sparkles className="h-3 w-3" />,
                accent: true
            },
        ];
    }, [profile]);

    const profileIdentity = useMemo(() => {
        if (!profile?.user?.email) {
            return {
                displayName: 'User',
                email: 'N/A',
                plan: 'Standard',
                role: 'User',
                initial: 'U',
                joined: 'N/A'
            };
        }

        const email = profile.user.email;
        const explicitName = (profile.user.name || '').trim();
        const displayName = explicitName || (() => {
            const localPart = email.split('@')[0] || '';
            return localPart
                .replace(/[._-]+/g, ' ')
                .split(' ')
                .filter(Boolean)
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                .join(' ')
                || 'User';
        })();

        const role = String(profile.user.role || 'user').toLowerCase();
        const plan = role === 'admin' ? 'Enterprise' : 'Pro';

        return {
            displayName,
            email,
            plan,
            role: role === 'admin' ? 'Workspace Admin' : 'Lead Analyst',
            initial: displayName.charAt(0).toUpperCase() || 'U',
            joined: 'Jan 12, 2024' // Placeholder
        };
    }, [profile]);

    const monthlySummaryInsight = useMemo(() => {
        if (!profile) return { growthPct: 0, title: '', message: '' };

        const sorted = [...profile.monthly_activity].sort((a, b) => (a.month > b.month ? 1 : -1));
        const latest = sorted[sorted.length - 1];
        const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;

        const toActions = (row: any) => (row?.uploads || 0) + (row?.generated_dashboards || 0) + (row?.saved_dashboards || 0) + (row?.analyses || 0) + (row?.chats || 0);

        const monthActions = toActions(latest);
        const prevActions = toActions(previous);
        const growthPct = prevActions > 0 ? ((monthActions - prevActions) / prevActions) * 100 : (monthActions > 0 ? 100 : 0);

        const title = growthPct >= 0 ? 'Monthly activity milestone' : 'Monthly activity summary';
        const message = `You completed ${monthActions.toLocaleString()} actions this month. You're in the top 4% of analysts this quarter.`;

        return { growthPct, title, message };
    }, [profile]);

    const chartData = useMemo(() => {
        if (!profile) return [];
        const sorted = [...profile.monthly_activity].sort((a, b) => (a.month > b.month ? 1 : -1));
        return sorted.map(row => {
            const [y, m] = row.month.split('-');
            const date = new Date(Number(y), Number(m) - 1, 1);
            return {
                name: date.toLocaleString('en-US', { month: 'short' }),
                v: row.uploads + row.generated_dashboards + row.saved_dashboards + row.analyses + row.chats
            };
        });
    }, [profile]);

    const openEditProfile = () => {
        if (!profile) return;
        setProfileMessage(null);
        setEditForm({
            name: profile.user.name || '',
            email: profile.user.email || '',
        });
        setIsEditOpen(true);
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile) return;

        setIsSavingProfile(true);
        setProfileMessage(null);

        try {
            await userApi.updateMyProfile({
                name: editForm.name.trim(),
                email: editForm.email.trim(),
            });

            const refreshed = await userApi.getProfileStats();
            setProfile(refreshed);
            setEditForm({
                name: refreshed.user.name || '',
                email: refreshed.user.email || '',
            });
            setIsEditOpen(false);
            setProfileMessage('Profile updated successfully.');
        } catch (err: any) {
            setProfileMessage(err?.response?.data?.detail || 'Failed to update profile.');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const dismissMilestone = () => {
        setIsMilestoneDismissed(true);
        localStorage.setItem(milestoneStorageKey, '1');
    };

    if (loading) {
        return (
            <div>
                <PageHeader
                    breadcrumb={["Account"]}
                    title="Your workspace"
                    description="Personal usage, milestones, and account settings"
                />
                <div className="grid grid-cols-12 gap-4 px-5 py-4 mt-8">
                    <div className="col-span-12 lg:col-span-4 h-96 animate-pulse rounded-lg bg-border"></div>
                    <div className="col-span-12 lg:col-span-8 space-y-4">
                        <div className="h-24 animate-pulse rounded-lg bg-border"></div>
                        <div className="h-[250px] animate-pulse rounded-lg bg-border"></div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div>
                <PageHeader
                    breadcrumb={["Account"]}
                    title="Your workspace"
                    description="Personal usage, milestones, and account settings"
                />
                <div className="mx-5 mt-8">
                    <div className="flex max-w-lg flex-col items-center justify-center space-y-4 rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                            <X className="h-6 w-6" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-[14px] font-semibold text-destructive">Failed to load profile</h3>
                            <p className="text-[12px] text-muted-foreground">{error}</p>
                        </div>
                        <BtnSecondary onClick={() => window.location.reload()}>Retry</BtnSecondary>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                breadcrumb={["Account"]}
                title="Your workspace"
                description="Personal usage, milestones, and account settings"
                actions={<BtnSecondary onClick={openEditProfile}>Edit profile</BtnSecondary>}
            />

            {profileMessage && (
                <div className="mx-5 mt-4 rounded-lg border border-accent/30 bg-accent/10 p-3 text-[13px] text-accent-foreground">
                    {profileMessage}
                </div>
            )}

            {!isMilestoneDismissed && (
                <div className="mx-5 mt-4">
                    <div className="ai-glow flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                        <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-primary to-warning text-background">
                                <Trophy className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="text-[13px] font-semibold">{monthlySummaryInsight.title}</div>
                                <div className="text-[11.5px] text-muted-foreground">{monthlySummaryInsight.message}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <BtnSecondary>Share milestone</BtnSecondary>
                            <button onClick={dismissMilestone} className="rounded p-1 text-muted-foreground hover:bg-surface-2"><X className="h-3.5 w-3.5" /></button>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-12 gap-4 px-5 py-4">
                {/* Profile */}
                <Panel className="col-span-12 lg:col-span-4">
                    <PanelHeader title="Profile" subtitle={`vizzy.app/u/${profileIdentity.email.split('@')[0]}`} />
                    <div className="p-5">
                        <div className="flex items-center gap-4">
                            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-accent to-primary text-[20px] font-semibold text-background">{profileIdentity.initial}</div>
                            <div>
                                <div className="text-[16px] font-semibold">{profileIdentity.displayName}</div>
                                <div className="text-[12px] text-muted-foreground">{profileIdentity.role}</div>
                                <div className="mt-1 flex gap-1.5">
                                    <Pill tone="accent">{profileIdentity.plan}</Pill>
                                    <Pill>Active Account</Pill>
                                </div>
                            </div>
                        </div>
                        <dl className="mt-5 grid grid-cols-2 gap-3 text-[12px]">
                            <div className="col-span-2">
                                <dt className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Email</dt>
                                <dd className="mt-0.5 font-mono">{profileIdentity.email}</dd>
                            </div>
                            <div>
                                <dt className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Joined</dt>
                                <dd className="mt-0.5">{profileIdentity.joined}</dd>
                            </div>
                            <div>
                                <dt className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Timezone</dt>
                                <dd className="mt-0.5">{Intl.DateTimeFormat().resolvedOptions().timeZone}</dd>
                            </div>
                            <div>
                                <dt className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Plan</dt>
                                <dd className="mt-0.5">{profileIdentity.plan}</dd>
                            </div>
                        </dl>
                    </div>
                </Panel>

                {/* Usage stats */}
                <div className="col-span-12 lg:col-span-8 space-y-4">
                    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
                        {kpis.map((kpi, idx) => (
                            <Kpi key={idx} label={kpi.label} value={kpi.value.toLocaleString()} icon={kpi.icon} accent={kpi.accent} />
                        ))}
                    </div>

                    <Panel>
                        <PanelHeader
                            title="Activity"
                            subtitle="Actions per month · this year"
                            icon={<Zap className="h-3.5 w-3.5" />}
                            actions={monthlySummaryInsight.growthPct !== 0 ? <Pill tone={monthlySummaryInsight.growthPct > 0 ? "success" : "default"}>{monthlySummaryInsight.growthPct > 0 ? "+" : ""}{monthlySummaryInsight.growthPct.toFixed(0)}% vs prev</Pill> : undefined}
                        />
                        <div className="h-[200px] p-4" ref={monthlySummaryRef}>
                            <Line
                                data={{
                                    labels: chartData.map(d => d.name),
                                    datasets: [{
                                        label: 'Activity',
                                        data: chartData.map(d => d.v),
                                        borderColor: 'var(--chart-1)',
                                        backgroundColor: 'rgba(var(--chart-1-rgb), 0.2)',
                                        fill: true,
                                        tension: 0.4,
                                        borderWidth: 1.8,
                                        pointRadius: 0,
                                        pointHoverRadius: 4,
                                    }]
                                }}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: { display: false },
                                        tooltip: {
                                            enabled: true,
                                            mode: 'index',
                                            intersect: false,
                                        }
                                    },
                                    scales: {
                                        x: {
                                            display: false,
                                        },
                                        y: {
                                            display: false,
                                        }
                                    }
                                }}
                            />
                        </div>
                    </Panel>
                </div>
            </div>

            {/* edit modal */}
            {isEditOpen && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-6 backdrop-blur-sm" onClick={() => setIsEditOpen(false)}>
                    <div className="panel-elev w-[460px]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <h3 className="text-[14px] font-semibold">Edit profile</h3>
                            <button type="button" onClick={() => setIsEditOpen(false)} className="rounded p-1 hover:bg-surface-2"><X className="h-3.5 w-3.5" /></button>
                        </div>
                        <form onSubmit={handleSaveProfile}>
                            <div className="space-y-4 p-5">
                                <Input label="Display name" required value={editForm.name} onChange={(v) => setEditForm(prev => ({ ...prev, name: v }))} />
                                <Input label="Email" type="email" required value={editForm.email} onChange={(v) => setEditForm(prev => ({ ...prev, email: v }))} />
                                <Input label="Role" value={profileIdentity.role} onChange={() => {}} />
                            </div>
                            <div className="flex justify-end gap-2 border-t border-border bg-surface-2/40 px-5 py-3">
                                <BtnSecondary onClick={() => setIsEditOpen(false)}>Cancel</BtnSecondary>
                                <button type="submit" disabled={isSavingProfile} className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                                    {isSavingProfile ? 'Saving...' : 'Save changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
