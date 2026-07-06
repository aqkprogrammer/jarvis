"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Copy,
  Loader2,
  Plus,
  Trash2,
  Webhook,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getApi } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/components/ui/button";
import { extractItems } from "./shared";
import type { WebhookTrigger, Workflow } from "@/types";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions / non-secure context) — ignore
    }
  };
  return (
    <button
      onClick={copy}
      title="Copy webhook URL"
      className="p-1.5 rounded-md text-jarvis-text-muted hover:text-primary hover:bg-primary/5 transition-colors shrink-0"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function TriggerRow({
  trigger,
  workflowName,
  onToggle,
  onDelete,
  isToggling,
  isDeleting,
}: {
  trigger: WebhookTrigger;
  workflowName?: string;
  onToggle: () => void;
  onDelete: () => void;
  isToggling: boolean;
  isDeleting: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      layout
      className={cn(
        "jarvis-card p-4 transition-all duration-200 hover:border-primary/30",
        !trigger.is_active && "opacity-70"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 shrink-0">
          <Webhook className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-mono text-jarvis-text truncate">{trigger.name}</p>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-300 text-[10px] font-mono shrink-0">
              <WorkflowIcon className="w-2.5 h-2.5" />
              {workflowName ?? "Unknown workflow"}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1 min-w-0">
            <code className="text-[11px] font-mono text-primary/70 truncate">{trigger.url}</code>
            <CopyButton value={trigger.url} />
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onToggle}
            disabled={isToggling}
            title={trigger.is_active ? "Deactivate trigger" : "Activate trigger"}
            className={cn(
              "w-10 h-[22px] rounded-full transition-colors disabled:opacity-50",
              trigger.is_active ? "bg-primary/80" : "bg-jarvis-border"
            )}
          >
            <span
              className={cn(
                "block w-4 h-4 bg-white rounded-full mx-0.5 transition-transform",
                trigger.is_active ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>

          <button
            onClick={() => {
              if (confirming) {
                onDelete();
                setConfirming(false);
              } else {
                setConfirming(true);
              }
            }}
            onMouseLeave={() => setConfirming(false)}
            disabled={isDeleting}
            title={confirming ? "Click again to confirm" : "Delete trigger"}
            className={cn(
              "flex items-center gap-1 p-2 rounded-lg transition-all",
              confirming
                ? "text-red-400 bg-red-500/10 border border-red-500/30"
                : "text-jarvis-text-muted hover:text-red-400 hover:bg-red-500/5 border border-transparent"
            )}
          >
            {isDeleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                {confirming && <span className="text-[10px] font-mono">Confirm?</span>}
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 pl-11">
        <span className="text-[10px] font-mono text-jarvis-text-muted uppercase tracking-wider">
          Triggered{" "}
          <span className="text-primary font-semibold">{trigger.trigger_count}</span> time
          {trigger.trigger_count === 1 ? "" : "s"}
        </span>
        <span className="text-[10px] font-mono text-jarvis-text-muted uppercase tracking-wider">
          Last triggered{" "}
          <span className="text-jarvis-text normal-case">
            {trigger.last_triggered_at
              ? formatDistanceToNow(new Date(trigger.last_triggered_at), { addSuffix: true })
              : "never"}
          </span>
        </span>
      </div>
    </motion.div>
  );
}

export function IncomingWebhooks() {
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const queryClient = useQueryClient();
  const { addNotification } = useUIStore();

  const { data: triggers = [], isLoading } = useQuery({
    queryKey: ["webhook-triggers"],
    queryFn: async () => {
      const response = await getApi().webhooks.listTriggers();
      return extractItems<WebhookTrigger>(response.data);
    },
  });

  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      const response = await getApi().workflows.list();
      return extractItems<Workflow>(response.data);
    },
  });

  const workflowNames = useMemo(
    () => Object.fromEntries(workflows.map((w) => [w.id, w.name])),
    [workflows]
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["webhook-triggers"] });

  const createMutation = useMutation({
    mutationFn: () => getApi().webhooks.createTrigger({ name: name.trim(), workflow_id: workflowId }),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      addNotification("success", "Trigger Created", `"${name.trim()}" is live — POST to its URL to run the workflow`);
    },
    onError: (error) => addNotification("error", "Create Failed", (error as Error).message),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => getApi().webhooks.toggleTrigger(id),
    onSuccess: invalidate,
    onError: (error) => addNotification("error", "Toggle Failed", (error as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => getApi().webhooks.deleteTrigger(id),
    onSuccess: invalidate,
    onError: (error) => addNotification("error", "Delete Failed", (error as Error).message),
  });

  const openCreate = () => {
    setName("");
    setWorkflowId(workflows[0]?.id ?? "");
    setModalOpen(true);
  };

  const formValid = name.trim().length > 0 && workflowId.length > 0;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook className="w-4 h-4 text-primary" />
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-jarvis-text-muted">
            Incoming Webhooks
          </h2>
          <span className="text-[10px] font-mono text-jarvis-text-muted/60">
            — trigger workflows from external systems
          </span>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-mono hover:bg-primary/20 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          New Trigger
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-jarvis-surface animate-pulse" />
          ))}
        </div>
      ) : triggers.length === 0 ? (
        <div className="jarvis-card p-6 text-center">
          <p className="text-xs font-mono text-jarvis-text-muted">
            No incoming webhooks yet — create a trigger to run a workflow via HTTP POST.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {triggers.map((trigger) => (
              <TriggerRow
                key={trigger.id}
                trigger={trigger}
                workflowName={workflowNames[trigger.workflow_id]}
                onToggle={() => toggleMutation.mutate(trigger.id)}
                onDelete={() => deleteMutation.mutate(trigger.id)}
                isToggling={toggleMutation.isPending && toggleMutation.variables === trigger.id}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === trigger.id}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* New trigger modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-strong border border-jarvis-border rounded-2xl p-6 w-full max-w-md"
            >
              <h2 className="text-lg font-mono font-bold text-jarvis-text mb-4">New Webhook Trigger</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                    Name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="jarvis-input w-full text-sm"
                    placeholder="e.g. CI Pipeline Hook"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                    Workflow
                  </label>
                  <select
                    value={workflowId}
                    onChange={(e) => setWorkflowId(e.target.value)}
                    className="jarvis-input w-full text-sm"
                  >
                    <option value="" className="bg-jarvis-surface">
                      Select a workflow...
                    </option>
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id} className="bg-jarvis-surface">
                        {w.name}
                      </option>
                    ))}
                  </select>
                  {workflows.length === 0 && (
                    <p className="text-[11px] font-mono text-amber-400 mt-1.5">
                      No workflows available — create one on the Workflows page first.
                    </p>
                  )}
                </div>

                <p className="text-[11px] font-mono text-jarvis-text-muted/70">
                  You will get a unique URL — any HTTP POST to it runs the selected workflow with the
                  request body as input.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg glass border border-jarvis-border text-sm font-mono text-jarvis-text-muted hover:text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={!formValid || createMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all disabled:opacity-50"
                >
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {createMutation.isPending ? "Creating..." : "Create Trigger"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
