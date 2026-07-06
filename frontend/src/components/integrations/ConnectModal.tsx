"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, Check, Loader2, RefreshCw, Unplug } from "lucide-react";
import { getApi } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/components/ui/button";
import { PROVIDER_META, configString } from "./shared";
import type { Integration, IntegrationProvider } from "@/types";

type SlackMode = "bot_token" | "webhook_url";

interface TestResult {
  status: string;
  error?: string;
}

function Field({
  label,
  optional,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
        {label}
        {optional && <span className="ml-1.5 text-jarvis-text-muted/60 normal-case">(optional)</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] font-mono text-jarvis-text-muted/70 mt-1.5">{hint}</p>}
    </div>
  );
}

export function ConnectModal({
  provider,
  existing,
  onClose,
}: {
  provider: IntegrationProvider;
  existing: Integration | null;
  onClose: () => void;
}) {
  const meta = PROVIDER_META[provider];
  const queryClient = useQueryClient();
  const { addNotification } = useUIStore();

  const [name, setName] = useState(existing?.name ?? "");
  const [token, setToken] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [slackMode, setSlackMode] = useState<SlackMode>("bot_token");
  const [defaultChannel, setDefaultChannel] = useState(configString(existing?.config, "default_channel"));
  const [parentPageId, setParentPageId] = useState(configString(existing?.config, "parent_page_id"));
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["integrations"] });

  /** Returns the credentials payload, or null when nothing was entered. */
  const buildCredentials = (): Record<string, string> | null => {
    switch (provider) {
      case "github":
        return token.trim() ? { token: token.trim() } : null;
      case "slack":
        if (slackMode === "bot_token") {
          return token.trim() ? { bot_token: token.trim() } : null;
        }
        return webhookUrl.trim() ? { webhook_url: webhookUrl.trim() } : null;
      case "discord":
        return webhookUrl.trim() ? { webhook_url: webhookUrl.trim() } : null;
      case "notion":
        return token.trim() ? { token: token.trim() } : null;
    }
  };

  const buildConfig = (): Record<string, unknown> => {
    const config: Record<string, unknown> = { ...(existing?.config ?? {}) };
    if (provider === "slack") config.default_channel = defaultChannel.trim();
    if (provider === "notion") config.parent_page_id = parentPageId.trim();
    return config;
  };

  const connectMutation = useMutation({
    mutationFn: async () => {
      const credentials = buildCredentials();
      if (!credentials) throw new Error("Credentials are required");
      const created = await getApi().integrations.create({
        provider,
        name: name.trim(),
        credentials,
        config: buildConfig(),
      });
      const id = (created.data as Integration).id;
      const test = await getApi().integrations.test(id);
      return test.data as TestResult;
    },
    onSuccess: (result) => {
      setTestResult(result);
      invalidate();
      if (result.status === "connected") {
        addNotification("success", "Integration Connected", `${name.trim()} is ready to use`);
      }
    },
    onError: (error) => {
      setTestResult({ status: "error", error: (error as Error).message });
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!existing) throw new Error("Nothing to update");
      const credentials = buildCredentials();
      await getApi().integrations.update(existing.id, {
        name: name.trim(),
        config: buildConfig(),
        ...(credentials ? { credentials } : {}),
      });
      const test = await getApi().integrations.test(existing.id);
      return test.data as TestResult;
    },
    onSuccess: (result) => {
      setTestResult(result);
      invalidate();
      addNotification("success", "Integration Updated", `${name.trim()} saved successfully`);
    },
    onError: (error) => {
      setTestResult({ status: "error", error: (error as Error).message });
      invalidate();
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!existing) throw new Error("Nothing to test");
      const response = await getApi().integrations.test(existing.id);
      return response.data as TestResult;
    },
    onSuccess: (result) => {
      setTestResult(result);
      invalidate();
    },
    onError: (error) => {
      setTestResult({ status: "error", error: (error as Error).message });
      invalidate();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!existing) throw new Error("Nothing to disconnect");
      return getApi().integrations.delete(existing.id);
    },
    onSuccess: () => {
      invalidate();
      addNotification("info", "Integration Disconnected", `${meta.label} has been disconnected`);
      onClose();
    },
    onError: (error) => addNotification("error", "Disconnect Failed", (error as Error).message),
  });

  const busy =
    connectMutation.isPending ||
    updateMutation.isPending ||
    testMutation.isPending ||
    disconnectMutation.isPending;

  const hasCredentialInput = buildCredentials() !== null;
  const canConnect = name.trim().length > 0 && hasCredentialInput;
  const canSave = name.trim().length > 0;
  const connected = testResult?.status === "connected";

  const credentialHint = existing ? "Leave blank to keep the current credentials." : undefined;

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
        className="glass-strong border border-jarvis-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
            <meta.icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-mono font-bold text-jarvis-text">
              {existing ? `Manage ${meta.label}` : `Connect ${meta.label}`}
            </h2>
            <p className="text-xs font-mono text-jarvis-text-muted">{meta.description}</p>
          </div>
        </div>

        <div className="space-y-4">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="jarvis-input w-full text-sm"
              placeholder={meta.namePlaceholder}
            />
          </Field>

          {provider === "github" && (
            <Field
              label="Personal Access Token"
              hint={credentialHint ?? "Needs repo scope to list repos, read PRs and create issues."}
            >
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="jarvis-input w-full text-sm"
                placeholder={existing ? "••••••••••••••••" : "ghp_..."}
                autoComplete="off"
              />
            </Field>
          )}

          {provider === "slack" && (
            <>
              <Field label="Authentication">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: "bot_token", label: "Bot Token" },
                      { value: "webhook_url", label: "Webhook URL" },
                    ] as const
                  ).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setSlackMode(value)}
                      className={cn(
                        "flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-mono transition-all",
                        slackMode === value
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-jarvis-border glass text-jarvis-text-muted hover:border-primary/30"
                      )}
                    >
                      <span
                        className={cn(
                          "w-3 h-3 rounded-full border",
                          slackMode === value ? "border-primary bg-primary/60" : "border-jarvis-border"
                        )}
                      />
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
              {slackMode === "bot_token" ? (
                <Field label="Bot Token" hint={credentialHint}>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="jarvis-input w-full text-sm"
                    placeholder={existing ? "••••••••••••••••" : "xoxb-..."}
                    autoComplete="off"
                  />
                </Field>
              ) : (
                <Field label="Webhook URL" hint={credentialHint}>
                  <input
                    type="password"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="jarvis-input w-full text-sm"
                    placeholder={existing ? "••••••••••••••••" : "https://hooks.slack.com/services/..."}
                    autoComplete="off"
                  />
                </Field>
              )}
              <Field label="Default Channel" optional>
                <input
                  value={defaultChannel}
                  onChange={(e) => setDefaultChannel(e.target.value)}
                  className="jarvis-input w-full text-sm"
                  placeholder="#general"
                />
              </Field>
            </>
          )}

          {provider === "discord" && (
            <Field label="Webhook URL" hint={credentialHint}>
              <input
                type="password"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="jarvis-input w-full text-sm"
                placeholder={existing ? "••••••••••••••••" : "https://discord.com/api/webhooks/..."}
                autoComplete="off"
              />
            </Field>
          )}

          {provider === "notion" && (
            <>
              <Field label="Integration Token" hint={credentialHint}>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="jarvis-input w-full text-sm"
                  placeholder={existing ? "••••••••••••••••" : "ntn_..."}
                  autoComplete="off"
                />
              </Field>
              <Field label="Parent Page ID" optional hint="New pages are created under this page.">
                <input
                  value={parentPageId}
                  onChange={(e) => setParentPageId(e.target.value)}
                  className="jarvis-input w-full text-sm"
                  placeholder="a1b2c3d4-..."
                />
              </Field>
            </>
          )}

          {existing?.status === "error" && existing.last_error && !testResult && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs font-mono text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{existing.last_error}</span>
            </div>
          )}

          {testResult && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs font-mono",
                connected
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400"
              )}
            >
              {connected ? (
                <>
                  <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Connection test passed — {meta.label} is reachable.</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{testResult.error ?? "Connection test failed."}</span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mt-6">
          {existing && (
            <button
              onClick={() => {
                if (confirmingDisconnect) {
                  disconnectMutation.mutate();
                } else {
                  setConfirmingDisconnect(true);
                }
              }}
              onMouseLeave={() => setConfirmingDisconnect(false)}
              disabled={busy}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-mono transition-all disabled:opacity-50",
                confirmingDisconnect
                  ? "text-red-400 bg-red-500/10 border border-red-500/30"
                  : "text-jarvis-text-muted border border-transparent hover:text-red-400 hover:bg-red-500/5"
              )}
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Unplug className="w-3.5 h-3.5" />
              )}
              {confirmingDisconnect ? "Confirm disconnect?" : "Disconnect"}
            </button>
          )}

          <div className="flex-1" />

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg glass border border-jarvis-border text-sm font-mono text-jarvis-text-muted hover:text-primary transition-colors"
          >
            {connected && !existing ? "Close" : "Cancel"}
          </button>

          {existing ? (
            <>
              <button
                onClick={() => testMutation.mutate()}
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg glass border border-jarvis-border text-sm font-mono text-jarvis-text-muted hover:text-primary hover:border-primary/30 transition-all disabled:opacity-50"
              >
                {testMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Test
              </button>
              <button
                onClick={() => updateMutation.mutate()}
                disabled={!canSave || busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all disabled:opacity-50"
              >
                {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </>
          ) : (
            <button
              onClick={() => connectMutation.mutate()}
              disabled={!canConnect || busy || connected}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all disabled:opacity-50"
            >
              {connectMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {connectMutation.isPending ? "Connecting..." : connected ? "Connected" : "Connect"}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
