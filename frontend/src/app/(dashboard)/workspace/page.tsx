"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Plus,
  Mail,
  Copy,
  Check,
  Trash2,
  Loader2,
  Crown,
  MessageSquare,
  Share2,
  AlertTriangle,
  X,
  Link2,
} from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { getApi } from "@/lib/api";
import { cn } from "@/components/ui/button";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type {
  ConversationSummary,
  SharedConversation,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
} from "@/types";

/** Unwraps list responses that may be a raw array or an {items}/{data} envelope. */
function unwrapList<T>(data: unknown): T[] {
  const d = data as { items?: T[]; data?: T[] } | T[];
  const items = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
  return Array.isArray(items) ? items : [];
}

function Avatar({ name, online }: { name: string; online?: boolean }) {
  return (
    <div className="relative shrink-0">
      <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
        <span className="text-sm font-mono font-bold text-primary uppercase">
          {name.charAt(0) || "?"}
        </span>
      </div>
      {online !== undefined && (
        <span
          title={online ? "Online" : "Offline"}
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-jarvis-surface",
            online ? "bg-jarvis-success animate-pulse" : "bg-jarvis-border"
          )}
        />
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: WorkspaceRole }) {
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border shrink-0",
        role === "admin"
          ? "bg-primary/10 border-primary/30 text-primary"
          : "bg-jarvis-surface border-jarvis-border text-jarvis-text-muted"
      )}
    >
      {role}
    </span>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — ignore
    }
  };

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-mono hover:bg-primary/20 transition-all shrink-0"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : label ?? "Copy"}
    </button>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  aside,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-jarvis-text-muted">
          {title}
        </h2>
      </div>
      {aside}
    </div>
  );
}

// ─── Create workspace modal ───────────────────────────────────────────────────

function CreateWorkspaceModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const { addNotification } = useUIStore();
  const loadWorkspaces = useWorkspaceStore((s) => s.load);
  const setActive = useWorkspaceStore((s) => s.setActive);

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await getApi().workspaces.create({ name: name.trim() });
      return response.data as Workspace;
    },
    onSuccess: async (workspace) => {
      await loadWorkspaces();
      setActive(workspace.id);
      addNotification("success", "Workspace Created", `"${workspace.name}" is ready`);
      onClose();
    },
    onError: (error) =>
      addNotification("error", "Create Failed", (error as Error).message),
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="glass-strong border border-jarvis-border rounded-2xl p-6 w-full max-w-md"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-mono font-bold text-jarvis-text">New Workspace</h2>
            <p className="text-xs font-mono text-jarvis-text-muted">
              A shared space for your team
            </p>
          </div>
        </div>

        <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) createMutation.mutate();
            if (e.key === "Escape") onClose();
          }}
          autoFocus
          placeholder="e.g. Stark Industries R&D"
          className="jarvis-input w-full text-sm"
        />

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-jarvis-border text-jarvis-text-muted text-sm font-mono hover:text-jarvis-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Create
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Invite member modal ──────────────────────────────────────────────────────

function InviteModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [created, setCreated] = useState<WorkspaceInvite | null>(null);
  const queryClient = useQueryClient();
  const { addNotification } = useUIStore();

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const response = await getApi().workspaces.createInvite(workspaceId, {
        email: email.trim(),
        role,
      });
      return response.data as WorkspaceInvite;
    },
    onSuccess: (invite) => {
      setCreated(invite);
      queryClient.invalidateQueries({ queryKey: ["workspace-invites", workspaceId] });
    },
    onError: (error) =>
      addNotification("error", "Invite Failed", (error as Error).message),
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="glass-strong border border-jarvis-border rounded-2xl p-6 w-full max-w-md"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-mono font-bold text-jarvis-text">Invite Member</h2>
            <p className="text-xs font-mono text-jarvis-text-muted">
              Send an invite link for this workspace
            </p>
          </div>
        </div>

        {created ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-jarvis-success/5 border border-jarvis-success/30 space-y-3">
              <div className="flex items-center gap-2 text-jarvis-success text-sm font-mono">
                <Check size={14} />
                Invite created for {created.email}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-jarvis-bg border border-jarvis-border text-xs font-mono text-primary break-all">
                  {created.invite_url}
                </code>
                <CopyButton text={created.invite_url} label="Copy link" />
              </div>
              <p className="text-[11px] font-mono text-jarvis-text-muted">
                Expires {new Date(created.expires_at).toLocaleDateString()} — share this link
                with your teammate.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && email.trim()) inviteMutation.mutate();
                  if (e.key === "Escape") onClose();
                }}
                autoFocus
                placeholder="teammate@company.com"
                className="jarvis-input w-full text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                Role
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["member", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={cn(
                      "flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-mono transition-all",
                      role === r
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-jarvis-border glass text-jarvis-text-muted hover:border-primary/30"
                    )}
                  >
                    <span
                      className={cn(
                        "w-3 h-3 rounded-full border",
                        role === r ? "border-primary bg-primary/60" : "border-jarvis-border"
                      )}
                    />
                    <span className="capitalize">{r}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-jarvis-border text-jarvis-text-muted text-sm font-mono hover:text-jarvis-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => inviteMutation.mutate()}
                disabled={!email.trim() || inviteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all disabled:opacity-50"
              >
                {inviteMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Mail size={14} />
                )}
                Create invite
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Members section ──────────────────────────────────────────────────────────

function MembersSection({
  workspace,
  isAdmin,
}: {
  workspace: Workspace;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const { addNotification } = useUIStore();
  const onlineUsers = useWorkspaceStore((s) => s.onlineUsers);
  const loadWorkspaces = useWorkspaceStore((s) => s.load);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["workspace-members", workspace.id],
    queryFn: async () => {
      const response = await getApi().workspaces.members(workspace.id);
      return unwrapList<WorkspaceMember>(response.data);
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["workspace-members", workspace.id] });

  const setRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: WorkspaceRole }) =>
      getApi().workspaces.setRole(workspace.id, userId, role),
    onSuccess: () => invalidate(),
    onError: (error) => addNotification("error", "Role Change Failed", (error as Error).message),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => getApi().workspaces.removeMember(workspace.id, userId),
    onSuccess: async () => {
      invalidate();
      await loadWorkspaces();
      addNotification("info", "Member Removed", "The member no longer has access");
    },
    onError: (error) => addNotification("error", "Remove Failed", (error as Error).message),
  });

  return (
    <section className="space-y-3">
      <SectionHeading
        icon={Users}
        title="Members"
        aside={
          <span className="text-xs font-mono text-jarvis-text-muted">
            <span className="text-primary font-semibold">{members.length}</span> member
            {members.length === 1 ? "" : "s"}
          </span>
        }
      />

      <div className="jarvis-card divide-y divide-jarvis-border">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-jarvis-surface animate-pulse" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <p className="p-6 text-center text-sm font-mono text-jarvis-text-muted">
            No members yet.
          </p>
        ) : (
          members.map((member) => {
            const isOwnerRow = member.user_id === workspace.owner_id;
            const online = onlineUsers.some((u) => u.user_id === member.user_id);
            return (
              <div key={member.user_id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={member.username} online={online} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono text-jarvis-text truncate">
                      {member.username}
                    </p>
                    <RoleBadge role={member.role} />
                    {isOwnerRow && (
                      <span
                        title="Workspace owner"
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-jarvis-warning/10 border border-jarvis-warning/30 text-jarvis-warning shrink-0"
                      >
                        <Crown size={10} />
                        owner
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-jarvis-text-muted truncate mt-0.5">
                    {member.email}
                  </p>
                </div>

                {isAdmin && !isOwnerRow && (
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={member.role}
                      onChange={(e) =>
                        setRoleMutation.mutate({
                          userId: member.user_id,
                          role: e.target.value as WorkspaceRole,
                        })
                      }
                      disabled={setRoleMutation.isPending}
                      className="jarvis-input text-xs font-mono py-1.5 px-2 disabled:opacity-50"
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                    <button
                      onClick={() => {
                        if (confirmingId === member.user_id) {
                          removeMutation.mutate(member.user_id);
                          setConfirmingId(null);
                        } else {
                          setConfirmingId(member.user_id);
                        }
                      }}
                      onMouseLeave={() =>
                        setConfirmingId((id) => (id === member.user_id ? null : id))
                      }
                      disabled={removeMutation.isPending && removeMutation.variables === member.user_id}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all",
                        confirmingId === member.user_id
                          ? "text-red-400 bg-red-500/10 border border-red-500/40"
                          : "text-jarvis-text-muted border border-jarvis-border hover:text-red-400 hover:border-red-500/40"
                      )}
                    >
                      {removeMutation.isPending && removeMutation.variables === member.user_id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                      {confirmingId === member.user_id ? "Confirm?" : "Remove"}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

// ─── Invites section (admin only) ─────────────────────────────────────────────

function InvitesSection({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const { addNotification } = useUIStore();
  const [showInviteModal, setShowInviteModal] = useState(false);

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ["workspace-invites", workspaceId],
    queryFn: async () => {
      const response = await getApi().workspaces.listInvites(workspaceId);
      return unwrapList<WorkspaceInvite>(response.data);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => getApi().workspaces.revokeInvite(workspaceId, inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-invites", workspaceId] });
      addNotification("info", "Invite Revoked", "The invite link is no longer valid");
    },
    onError: (error) => addNotification("error", "Revoke Failed", (error as Error).message),
  });

  return (
    <section className="space-y-3">
      <SectionHeading
        icon={Link2}
        title="Pending Invites"
        aside={
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-mono hover:bg-primary/20 transition-all"
          >
            <Plus size={12} />
            Invite member
          </button>
        }
      />

      <div className="jarvis-card divide-y divide-jarvis-border">
        {isLoading ? (
          <div className="p-4">
            <div className="h-12 rounded-lg bg-jarvis-surface animate-pulse" />
          </div>
        ) : invites.length === 0 ? (
          <p className="p-6 text-center text-sm font-mono text-jarvis-text-muted">
            No pending invites. Invite a teammate to collaborate.
          </p>
        ) : (
          invites.map((invite) => (
            <div key={invite.id} className="flex items-center gap-3 px-4 py-3">
              <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 shrink-0">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono text-jarvis-text truncate">{invite.email}</p>
                  <RoleBadge role={invite.role} />
                </div>
                <p className="text-xs font-mono text-jarvis-text-muted mt-0.5">
                  Expires {new Date(invite.expires_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <CopyButton text={invite.invite_url} label="Copy link" />
                <button
                  onClick={() => revokeMutation.mutate(invite.id)}
                  disabled={revokeMutation.isPending && revokeMutation.variables === invite.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-jarvis-text-muted border border-jarvis-border hover:text-red-400 hover:border-red-500/40 transition-all"
                >
                  {revokeMutation.isPending && revokeMutation.variables === invite.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <X size={12} />
                  )}
                  Revoke
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <AnimatePresence>
        {showInviteModal && (
          <InviteModal workspaceId={workspaceId} onClose={() => setShowInviteModal(false)} />
        )}
      </AnimatePresence>
    </section>
  );
}

// ─── Shared conversations section ─────────────────────────────────────────────

function SharedConversationsSection({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const { addNotification } = useUIStore();
  const [selectedId, setSelectedId] = useState("");

  const { data: shared = [], isLoading } = useQuery({
    queryKey: ["workspace-shared", workspaceId],
    queryFn: async () => {
      const response = await getApi().workspaces.sharedConversations(workspaceId);
      return unwrapList<SharedConversation>(response.data);
    },
  });

  const { data: myConversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const response = await getApi().conversations.list();
      return unwrapList<ConversationSummary>(response.data);
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["workspace-shared", workspaceId] });

  const shareMutation = useMutation({
    mutationFn: (conversationId: string) =>
      getApi().workspaces.shareConversation(workspaceId, conversationId),
    onSuccess: () => {
      invalidate();
      setSelectedId("");
      addNotification("success", "Conversation Shared", "Your team can now see this conversation");
    },
    onError: (error) => addNotification("error", "Share Failed", (error as Error).message),
  });

  const unshareMutation = useMutation({
    mutationFn: (conversationId: string) =>
      getApi().workspaces.unshareConversation(workspaceId, conversationId),
    onSuccess: () => {
      invalidate();
      addNotification("info", "Conversation Unshared", "It is now private again");
    },
    onError: (error) => addNotification("error", "Unshare Failed", (error as Error).message),
  });

  const sharedIds = useMemo(() => new Set(shared.map((s) => s.id)), [shared]);
  const shareable = myConversations.filter((c) => !sharedIds.has(c.id));

  return (
    <section className="space-y-3">
      <SectionHeading icon={MessageSquare} title="Shared Conversations" />

      {/* Share picker */}
      <div className="jarvis-card p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="jarvis-input flex-1 text-sm font-mono py-2"
        >
          <option value="">Share a conversation…</option>
          {shareable.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <button
          onClick={() => selectedId && shareMutation.mutate(selectedId)}
          disabled={!selectedId || shareMutation.isPending}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all disabled:opacity-50 shrink-0"
        >
          {shareMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Share2 size={14} />
          )}
          Share
        </button>
      </div>

      <div className="jarvis-card divide-y divide-jarvis-border">
        {isLoading ? (
          <div className="p-4">
            <div className="h-12 rounded-lg bg-jarvis-surface animate-pulse" />
          </div>
        ) : shared.length === 0 ? (
          <p className="p-6 text-center text-sm font-mono text-jarvis-text-muted">
            No shared conversations yet.
          </p>
        ) : (
          shared.map((conversation) => (
            <div key={conversation.id} className="flex items-center gap-3 px-4 py-3">
              <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 shrink-0">
                <MessageSquare className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono text-jarvis-text truncate">{conversation.title}</p>
                <p className="text-xs font-mono text-jarvis-text-muted mt-0.5">
                  Updated {new Date(conversation.updated_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => unshareMutation.mutate(conversation.id)}
                disabled={unshareMutation.isPending && unshareMutation.variables === conversation.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-jarvis-text-muted border border-jarvis-border hover:text-red-400 hover:border-red-500/40 transition-all shrink-0"
              >
                {unshareMutation.isPending && unshareMutation.variables === conversation.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <X size={12} />
                )}
                Unshare
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

// ─── Danger zone (owner only) ─────────────────────────────────────────────────

function DangerZone({ workspace }: { workspace: Workspace }) {
  const [confirmName, setConfirmName] = useState("");
  const { addNotification } = useUIStore();
  const loadWorkspaces = useWorkspaceStore((s) => s.load);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => getApi().workspaces.delete(workspace.id),
    onSuccess: async () => {
      setActive(null);
      await loadWorkspaces();
      queryClient.removeQueries({ queryKey: ["workspace-members", workspace.id] });
      queryClient.removeQueries({ queryKey: ["workspace-invites", workspace.id] });
      queryClient.removeQueries({ queryKey: ["workspace-shared", workspace.id] });
      addNotification("info", "Workspace Deleted", `"${workspace.name}" has been deleted`);
    },
    onError: (error) => addNotification("error", "Delete Failed", (error as Error).message),
  });

  const nameMatches = confirmName === workspace.name;

  return (
    <section className="space-y-3">
      <SectionHeading icon={AlertTriangle} title="Danger Zone" />
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
        <div>
          <p className="text-sm font-mono text-jarvis-text">Delete this workspace</p>
          <p className="text-xs font-mono text-jarvis-text-muted mt-0.5">
            Removes all members, invites and shared conversations. This cannot be undone. Type{" "}
            <span className="text-red-400 font-semibold">{workspace.name}</span> to confirm.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={workspace.name}
            className="jarvis-input flex-1 text-sm font-mono"
          />
          <button
            onClick={() => nameMatches && deleteMutation.mutate()}
            disabled={!nameMatches || deleteMutation.isPending}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-red-500/40 text-red-400 text-sm font-mono hover:bg-red-500/10 transition-all disabled:opacity-40 shrink-0"
          >
            {deleteMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            Delete workspace
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const { user } = useAuthStore();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const isLoadingWorkspaces = useWorkspaceStore((s) => s.isLoading);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
  const isAdmin = activeWorkspace?.my_role === "admin";
  const isOwner = Boolean(activeWorkspace && user && activeWorkspace.owner_id === user.id);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Workspace" subtitle="Team members, invites and shared conversations" />

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Workspace selector row */}
        <div className="flex flex-wrap items-center gap-2">
          {workspaces.length > 1 &&
            workspaces.map((workspace) => (
              <button
                key={workspace.id}
                onClick={() => setActive(workspace.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-mono transition-all",
                  workspace.id === activeWorkspaceId
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-jarvis-border glass text-jarvis-text-muted hover:border-primary/30"
                )}
              >
                <Users size={13} />
                {workspace.name}
                <span className="text-[10px] opacity-60">{workspace.member_count}</span>
              </button>
            ))}
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-jarvis-border text-sm font-mono text-jarvis-text-muted hover:text-primary hover:border-primary/40 transition-all"
          >
            <Plus size={13} />
            New workspace
          </button>
        </div>

        {isLoadingWorkspaces && !activeWorkspace ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 rounded-xl bg-jarvis-surface animate-pulse" />
            ))}
          </div>
        ) : !activeWorkspace ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-sm font-mono text-jarvis-text">No workspace yet</p>
              <p className="text-xs font-mono text-jarvis-text-muted mt-1">
                Create one to collaborate with your team.
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all"
            >
              <Plus size={14} />
              New workspace
            </button>
          </div>
        ) : (
          <>
            {/* Active workspace banner */}
            <motion.div
              key={activeWorkspace.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="jarvis-card p-5 flex items-center gap-4"
            >
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-mono font-bold text-jarvis-text truncate">
                    {activeWorkspace.name}
                  </h2>
                  <RoleBadge role={activeWorkspace.my_role} />
                  {isOwner && (
                    <span
                      title="You own this workspace"
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-jarvis-warning/10 border border-jarvis-warning/30 text-jarvis-warning shrink-0"
                    >
                      <Crown size={10} />
                      owner
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono text-jarvis-text-muted mt-0.5">
                  {activeWorkspace.member_count} member
                  {activeWorkspace.member_count === 1 ? "" : "s"} · created{" "}
                  {new Date(activeWorkspace.created_at).toLocaleDateString()}
                </p>
              </div>
            </motion.div>

            <MembersSection workspace={activeWorkspace} isAdmin={isAdmin} />
            {isAdmin && <InvitesSection workspaceId={activeWorkspace.id} />}
            <SharedConversationsSection workspaceId={activeWorkspace.id} />
            {isOwner && <DangerZone workspace={activeWorkspace} />}
          </>
        )}
      </div>

      <AnimatePresence>
        {showCreateModal && <CreateWorkspaceModal onClose={() => setShowCreateModal(false)} />}
      </AnimatePresence>
    </div>
  );
}
