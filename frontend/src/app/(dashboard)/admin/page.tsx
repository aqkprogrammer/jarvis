"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  Activity, Clock, Coins, DollarSign, FileText, Loader2, MessageSquare,
  MessagesSquare, Search, ShieldAlert, ShieldCheck, Users, Workflow,
} from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { ActionChip } from "@/components/audit/ActionChip";
import { UsageBarChart, formatTokens, formatUsd } from "@/components/usage/UsageBarChart";
import { getApi } from "@/lib/api";
import { cn } from "@/components/ui/button";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import type { AdminStats, AdminUser, AuditLog, UsageDaily } from "@/types";

type UserPatch = { is_active?: boolean; is_admin?: boolean; monthly_token_quota?: number | null };

// ─── Small building blocks ────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="jarvis-card p-4">
      <div className="flex items-center gap-2 text-jarvis-text-muted">
        <Icon className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-mono uppercase tracking-widest">{label}</span>
      </div>
      <p className="mt-2 text-xl font-mono font-bold text-jarvis-text">{value}</p>
      {sub && <p className="text-[10px] font-mono text-jarvis-text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

/** Two-click confirm button — first click arms it, second click fires. */
function TwoClickButton({
  id,
  confirming,
  setConfirming,
  onConfirm,
  disabled,
  title,
  pending,
  children,
}: {
  id: string;
  confirming: string | null;
  setConfirming: React.Dispatch<React.SetStateAction<string | null>>;
  onConfirm: () => void;
  disabled?: boolean;
  title?: string;
  pending?: boolean;
  children: React.ReactNode;
}) {
  const armed = confirming === id;
  return (
    <button
      disabled={disabled || pending}
      title={title}
      onClick={() => {
        if (armed) {
          onConfirm();
          setConfirming(null);
        } else {
          setConfirming(id);
        }
      }}
      onMouseLeave={() => setConfirming((c) => (c === id ? null : c))}
      className={cn(
        "px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all whitespace-nowrap",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        armed
          ? "text-red-400 bg-red-500/10 border-red-500/40"
          : "text-jarvis-text-muted border-jarvis-border hover:text-primary hover:border-primary/40"
      )}
    >
      {pending ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : armed ? (
        "Confirm?"
      ) : (
        children
      )}
    </button>
  );
}

/** Click-to-edit quota cell — empty input saves as unlimited (null). */
function QuotaCell({
  user,
  onSave,
}: {
  user: AdminUser;
  onSave: (quota: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const save = () => {
    setEditing(false);
    const trimmed = value.trim();
    const next = trimmed === "" ? null : Math.max(0, Math.floor(Number(trimmed)));
    if (next !== null && Number.isNaN(next)) return;
    if (next === user.monthly_token_quota) return;
    onSave(next);
  };

  if (!editing) {
    return (
      <button
        onClick={() => {
          setValue(user.monthly_token_quota === null ? "" : String(user.monthly_token_quota));
          setEditing(true);
        }}
        title="Click to edit — leave empty for unlimited"
        className="px-2 py-1 -mx-2 rounded-md text-xs font-mono text-jarvis-text border border-transparent hover:border-primary/40 hover:text-primary transition-all"
      >
        {user.monthly_token_quota === null ? "Unlimited" : formatTokens(user.monthly_token_quota)}
      </button>
    );
  }

  return (
    <input
      type="number"
      autoFocus
      min={0}
      value={value}
      placeholder="unlimited"
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
      className="jarvis-input w-28 py-1 px-2 text-xs font-mono"
    />
  );
}

// ─── Dashboard (rendered only for admins) ─────────────────────────────────────

function AdminDashboard({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient();
  const { addNotification } = useUIStore();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => (await getApi().admin.stats()).data as AdminStats,
  });

  const { data: platformDaily = [] } = useQuery({
    queryKey: ["admin-usage-daily"],
    queryFn: async () => {
      const response = await getApi().admin.usageDaily({ days: 30 });
      return ((response.data as { items?: UsageDaily[] })?.items ?? []) as UsageDaily[];
    },
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users", q],
    queryFn: async () => {
      const response = await getApi().admin.users({ q: q || undefined, limit: 50, offset: 0 });
      return response.data as { items: AdminUser[]; total: number };
    },
    placeholderData: keepPreviousData,
  });

  const { data: recentAudit = [] } = useQuery({
    queryKey: ["admin-audit-recent"],
    queryFn: async () => {
      const response = await getApi().admin.audit({ limit: 10 });
      return ((response.data as { items?: AuditLog[] })?.items ?? []) as AuditLog[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UserPatch }) =>
      getApi().admin.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error) => addNotification("error", "Update Failed", (error as Error).message),
  });

  const users = usersData?.items ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Admin" subtitle="Platform-wide stats, users and activity" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Users"
            value={stats ? `${stats.users.active}/${stats.users.total}` : "—"}
            sub="active / total"
          />
          <StatCard
            icon={MessageSquare}
            label="Conversations"
            value={stats ? stats.conversations.toLocaleString() : "—"}
          />
          <StatCard
            icon={MessagesSquare}
            label="Messages"
            value={stats ? stats.messages.toLocaleString() : "—"}
          />
          <StatCard
            icon={FileText}
            label="Documents"
            value={stats ? stats.documents.toLocaleString() : "—"}
          />
          <StatCard
            icon={Workflow}
            label="Workflows"
            value={stats ? stats.workflows.toLocaleString() : "—"}
          />
          <StatCard
            icon={Clock}
            label="Schedules"
            value={stats ? `${stats.schedules.active}/${stats.schedules.total}` : "—"}
            sub="active / total"
          />
          <StatCard
            icon={Coins}
            label="30d Tokens"
            value={stats ? formatTokens(stats.tokens_30d) : "—"}
          />
          <StatCard
            icon={DollarSign}
            label="30d Cost"
            value={stats ? formatUsd(stats.cost_30d) : "—"}
          />
        </div>

        {/* Platform daily usage */}
        <div className="jarvis-card p-6">
          <h2 className="text-sm font-semibold font-mono text-jarvis-text-muted uppercase tracking-wider mb-4">
            Platform Daily Usage (30 days)
          </h2>
          <UsageBarChart data={platformDaily} />
        </div>

        {/* Users table */}
        <div className="jarvis-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-jarvis-border">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-jarvis-text-muted">
                Users
              </h2>
              <span className="text-xs font-mono text-jarvis-text-muted">
                ({usersData?.total ?? 0})
              </span>
            </div>
            <div className="relative w-64 max-w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-jarvis-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email or username..."
                className="jarvis-input w-full pl-9 pr-3 py-1.5 text-xs font-mono"
              />
            </div>
          </div>

          {usersLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-11 rounded-lg bg-jarvis-surface animate-pulse" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="p-8 text-center text-sm font-mono text-jarvis-text-muted">
              No users match your search.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono whitespace-nowrap">
                <thead>
                  <tr className="text-left text-jarvis-text-muted border-b border-jarvis-border">
                    <th className="px-4 py-2.5 font-medium">Email</th>
                    <th className="px-3 py-2.5 font-medium">Username</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Quota</th>
                    <th className="px-3 py-2.5 font-medium text-right">Convs</th>
                    <th className="px-3 py-2.5 font-medium text-right">30d Tokens</th>
                    <th className="px-3 py-2.5 font-medium text-right">30d Cost</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = u.id === currentUserId;
                    const rowPending =
                      updateMutation.isPending && updateMutation.variables?.id === u.id;
                    return (
                      <tr
                        key={u.id}
                        className={cn(
                          "border-b border-jarvis-border/40 last:border-0",
                          !u.is_active && "opacity-60"
                        )}
                      >
                        <td className="px-4 py-3 text-jarvis-text">
                          <span className="flex items-center gap-1.5">
                            {u.email}
                            {u.is_admin && (
                              <span title="Administrator">
                                <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-jarvis-text-muted">{u.username}</td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border",
                              u.is_active
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : "bg-red-500/10 border-red-500/30 text-red-400"
                            )}
                          >
                            {u.is_active ? "active" : "deactivated"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <QuotaCell
                            user={u}
                            onSave={(quota) =>
                              updateMutation.mutate({ id: u.id, data: { monthly_token_quota: quota } })
                            }
                          />
                        </td>
                        <td className="px-3 py-3 text-right text-jarvis-text-muted">
                          {u.conversation_count.toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-right text-jarvis-text-muted">
                          {formatTokens(u.tokens_30d)}
                        </td>
                        <td className="px-3 py-3 text-right text-primary">{formatUsd(u.cost_30d)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <TwoClickButton
                              id={`${u.id}:active`}
                              confirming={confirming}
                              setConfirming={setConfirming}
                              disabled={isSelf && u.is_active}
                              title={
                                isSelf && u.is_active
                                  ? "You cannot deactivate your own account"
                                  : undefined
                              }
                              pending={rowPending}
                              onConfirm={() =>
                                updateMutation.mutate({ id: u.id, data: { is_active: !u.is_active } })
                              }
                            >
                              {u.is_active ? "Deactivate" : "Activate"}
                            </TwoClickButton>
                            <TwoClickButton
                              id={`${u.id}:admin`}
                              confirming={confirming}
                              setConfirming={setConfirming}
                              disabled={isSelf && u.is_admin}
                              title={
                                isSelf && u.is_admin
                                  ? "You cannot remove your own admin access"
                                  : undefined
                              }
                              pending={rowPending}
                              onConfirm={() =>
                                updateMutation.mutate({ id: u.id, data: { is_admin: !u.is_admin } })
                              }
                            >
                              {u.is_admin ? "Demote" : "Make admin"}
                            </TwoClickButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent activity */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-jarvis-text-muted">
              Recent Activity
            </h2>
          </div>
          <div className="jarvis-card divide-y divide-jarvis-border/50">
            {recentAudit.length === 0 ? (
              <p className="p-6 text-center text-sm font-mono text-jarvis-text-muted">
                No recent events.
              </p>
            ) : (
              recentAudit.map((log) => (
                <div key={log.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    title={new Date(log.created_at).toLocaleString()}
                    className="w-28 shrink-0 text-[11px] font-mono text-jarvis-text-muted"
                  >
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </span>
                  <span
                    title={log.user_id}
                    className="w-36 shrink-0 truncate text-[11px] font-mono text-jarvis-text"
                  >
                    {log.user_id}
                  </span>
                  <ActionChip action={log.action} />
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Page (admin gate) ────────────────────────────────────────────────────────

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);

  if (!user || !user.is_admin) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Header title="Admin" subtitle="Platform administration" />
        <div className="flex-1 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="jarvis-card p-10 text-center max-w-md w-full"
          >
            <ShieldAlert className="w-10 h-10 text-jarvis-danger mx-auto mb-4" />
            <p className="text-lg font-mono font-bold text-jarvis-text tracking-widest">
              403 — ADMIN ACCESS REQUIRED
            </p>
            <p className="text-xs font-mono text-jarvis-text-muted mt-3">
              This console is restricted to platform administrators. Contact an admin if you
              believe you need access.
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return <AdminDashboard currentUserId={user.id} />;
}
