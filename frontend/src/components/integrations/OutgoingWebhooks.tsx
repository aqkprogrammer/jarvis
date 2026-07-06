"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Plus, Radio, ShieldCheck, Trash2, Wand2, Zap } from "lucide-react";
import { getApi } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/button";
import { extractItems } from "./shared";
import type { OutgoingWebhook, WebhookEvent } from "@/types";

const ALL_EVENTS: Array<{ value: WebhookEvent; label: string }> = [
  { value: "workflow.completed", label: "Workflow completed" },
  { value: "workflow.failed", label: "Workflow failed" },
  { value: "schedule.completed", label: "Schedule completed" },
  { value: "task.completed", label: "Task completed" },
];

function statusVariant(status?: string): "success" | "danger" | "muted" {
  if (!status) return "muted";
  return status.startsWith("2") ? "success" : "danger";
}

function WebhookRow({
  webhook,
  onTest,
  onDelete,
  isTesting,
  isDeleting,
}: {
  webhook: OutgoingWebhook;
  onTest: () => void;
  onDelete: () => void;
  isTesting: boolean;
  isDeleting: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      layout
      className="jarvis-card p-4 transition-all duration-200 hover:border-primary/30"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 shrink-0">
          <Radio className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-mono text-jarvis-text truncate">{webhook.name}</p>
            {webhook.secret && (
              <span title="Payloads are HMAC-SHA256 signed">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              </span>
            )}
          </div>
          <code className="block text-[11px] font-mono text-primary/70 truncate mt-1">
            {webhook.url}
          </code>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant={statusVariant(webhook.last_status)} className="text-[9px]">
            {webhook.last_status ?? "never sent"}
          </Badge>

          <button
            onClick={onTest}
            disabled={isTesting}
            title="Send a test event"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-jarvis-border glass text-[11px] font-mono text-jarvis-text-muted hover:text-primary hover:border-primary/30 transition-all disabled:opacity-50"
          >
            {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Test
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
            title={confirming ? "Click again to confirm" : "Delete webhook"}
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

      <div className="flex flex-wrap items-center gap-1.5 mt-3 pl-11">
        {webhook.events.map((event) => (
          <Badge key={event} variant="default" className="text-[9px]">
            {event}
          </Badge>
        ))}
      </div>
    </motion.div>
  );
}

export function OutgoingWebhooks() {
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [secret, setSecret] = useState("");
  const queryClient = useQueryClient();
  const { addNotification } = useUIStore();

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ["outgoing-webhooks"],
    queryFn: async () => {
      const response = await getApi().webhooks.listOutgoing();
      return extractItems<OutgoingWebhook>(response.data);
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["outgoing-webhooks"] });

  const createMutation = useMutation({
    mutationFn: () =>
      getApi().webhooks.createOutgoing({
        name: name.trim(),
        url: url.trim(),
        events,
        ...(secret.trim() ? { secret: secret.trim() } : {}),
      }),
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      addNotification("success", "Webhook Created", `"${name.trim()}" will receive event notifications`);
    },
    onError: (error) => addNotification("error", "Create Failed", (error as Error).message),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => getApi().webhooks.testOutgoing(id),
    onSuccess: (response, id) => {
      invalidate();
      const status = (response.data as { status?: string })?.status ?? "delivered";
      const hook = webhooks.find((w) => w.id === id);
      addNotification("success", "Test Delivered", `"${hook?.name ?? "Webhook"}" responded ${status}`);
    },
    onError: (error) => addNotification("error", "Test Failed", (error as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => getApi().webhooks.deleteOutgoing(id),
    onSuccess: invalidate,
    onError: (error) => addNotification("error", "Delete Failed", (error as Error).message),
  });

  const openCreate = () => {
    setName("");
    setUrl("");
    setEvents(["workflow.completed"]);
    setSecret("");
    setModalOpen(true);
  };

  const toggleEvent = (event: WebhookEvent) => {
    setEvents((current) =>
      current.includes(event) ? current.filter((e) => e !== event) : [...current, event]
    );
  };

  const formValid =
    name.trim().length > 0 && /^https?:\/\/.+/.test(url.trim()) && events.length > 0;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-jarvis-text-muted">
            Outgoing Webhooks
          </h2>
          <span className="text-[10px] font-mono text-jarvis-text-muted/60">
            — notify external systems when events fire
          </span>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-mono hover:bg-primary/20 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          New Webhook
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-jarvis-surface animate-pulse" />
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="jarvis-card p-6 text-center">
          <p className="text-xs font-mono text-jarvis-text-muted">
            No outgoing webhooks yet — add one to push workflow and task events to your systems.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {webhooks.map((webhook) => (
              <WebhookRow
                key={webhook.id}
                webhook={webhook}
                onTest={() => testMutation.mutate(webhook.id)}
                onDelete={() => deleteMutation.mutate(webhook.id)}
                isTesting={testMutation.isPending && testMutation.variables === webhook.id}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === webhook.id}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* New webhook modal */}
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
              className="glass-strong border border-jarvis-border rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-lg font-mono font-bold text-jarvis-text mb-4">New Outgoing Webhook</h2>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                    Name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="jarvis-input w-full text-sm"
                    placeholder="e.g. Ops Alerting"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                    Endpoint URL
                  </label>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="jarvis-input w-full text-sm"
                    placeholder="https://example.com/hooks/jarvis"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                    Events
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ALL_EVENTS.map(({ value, label }) => {
                      const checked = events.includes(value);
                      return (
                        <button
                          key={value}
                          onClick={() => toggleEvent(value)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono transition-all text-left",
                            checked
                              ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-jarvis-border glass text-jarvis-text-muted hover:border-primary/30"
                          )}
                        >
                          <span
                            className={cn(
                              "flex items-center justify-center w-3.5 h-3.5 rounded border shrink-0",
                              checked ? "border-primary bg-primary/60" : "border-jarvis-border"
                            )}
                          >
                            {checked && <span className="w-1.5 h-1.5 bg-white rounded-[1px]" />}
                          </span>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {events.length === 0 && (
                    <p className="text-[11px] font-mono text-amber-400 mt-1.5">
                      Select at least one event.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                    Secret <span className="text-jarvis-text-muted/60 normal-case">(optional)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      className="jarvis-input flex-1 text-sm"
                      placeholder="whsec_..."
                      autoComplete="off"
                    />
                    <button
                      onClick={() => setSecret(crypto.randomUUID())}
                      title="Generate a random secret"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg glass border border-jarvis-border text-xs font-mono text-jarvis-text-muted hover:text-primary hover:border-primary/30 transition-all shrink-0"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      Generate
                    </button>
                  </div>
                  <p className="flex items-center gap-1.5 text-[11px] font-mono text-jarvis-text-muted/70 mt-1.5">
                    <ShieldCheck className="w-3 h-3 shrink-0" />
                    Payloads are HMAC-SHA256 signed when a secret is set.
                  </p>
                </div>
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
                  {createMutation.isPending ? "Creating..." : "Create Webhook"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
