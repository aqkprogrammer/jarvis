"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plug, Settings2 } from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { getApi } from "@/lib/api";
import { cn } from "@/components/ui/button";
import { PROVIDER_META, PROVIDER_ORDER, extractItems } from "@/components/integrations/shared";
import { ConnectModal } from "@/components/integrations/ConnectModal";
import { GithubWorkspace } from "@/components/integrations/GithubWorkspace";
import { QuickSendPanel } from "@/components/integrations/QuickSendPanel";
import { IncomingWebhooks } from "@/components/integrations/IncomingWebhooks";
import { OutgoingWebhooks } from "@/components/integrations/OutgoingWebhooks";
import type { Integration, IntegrationProvider } from "@/types";

function ProviderCard({
  provider,
  integration,
  onConnect,
  onManage,
}: {
  provider: IntegrationProvider;
  integration?: Integration;
  onConnect: () => void;
  onManage: () => void;
}) {
  const meta = PROVIDER_META[provider];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="jarvis-card p-5 flex flex-col gap-3 transition-all duration-200 hover:border-primary/30"
    >
      <div className="flex items-start justify-between">
        <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20">
          <meta.icon className="w-5 h-5 text-primary" />
        </div>
        {integration && (
          <span
            title={integration.status === "error" ? integration.last_error ?? "Connection error" : undefined}
            className={cn(
              "flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider",
              integration.status === "connected" ? "text-emerald-400" : "text-red-400 cursor-help"
            )}
          >
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                integration.status === "connected" ? "bg-emerald-400 animate-pulse" : "bg-red-400"
              )}
            />
            {integration.status}
          </span>
        )}
      </div>

      <div className="flex-1">
        <p className="text-sm font-mono font-semibold text-jarvis-text">{meta.label}</p>
        <p className="text-xs font-mono text-jarvis-text-muted mt-0.5 truncate">
          {integration ? integration.name : meta.description}
        </p>
      </div>

      {integration ? (
        <button
          onClick={onManage}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg glass border border-jarvis-border text-xs font-mono text-jarvis-text-muted hover:text-primary hover:border-primary/30 transition-all"
        >
          <Settings2 className="w-3.5 h-3.5" />
          Manage
        </button>
      ) : (
        <button
          onClick={onConnect}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-jarvis-border bg-jarvis-surface text-xs font-mono text-jarvis-text-muted hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all"
        >
          <Plug className="w-3.5 h-3.5" />
          Connect
        </button>
      )}
    </motion.div>
  );
}

export default function IntegrationsPage() {
  const [modal, setModal] = useState<{
    provider: IntegrationProvider;
    existing: Integration | null;
  } | null>(null);

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const response = await getApi().integrations.list();
      return extractItems<Integration>(response.data);
    },
  });

  const byProvider = useMemo(() => {
    const map: Partial<Record<IntegrationProvider, Integration>> = {};
    integrations.forEach((integration) => {
      if (!map[integration.provider]) map[integration.provider] = integration;
    });
    return map;
  }, [integrations]);

  const github = byProvider.github;
  const slack = byProvider.slack;
  const discord = byProvider.discord;
  const notion = byProvider.notion;

  const connectedCount = integrations.filter((i) => i.status === "connected").length;
  const showQuickSend =
    (slack && slack.status === "connected") ||
    (discord && discord.status === "connected") ||
    (notion && notion.status === "connected");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Integrations" subtitle="Connect JARVIS to external services and webhooks" />

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Provider cards */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plug className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-jarvis-text-muted">
                Providers
              </h2>
            </div>
            <span className="text-xs font-mono text-jarvis-text-muted">
              <span className="text-success font-semibold">{connectedCount}</span> connected
            </span>
          </div>

          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-40 rounded-xl bg-jarvis-surface animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {PROVIDER_ORDER.map((provider) => (
                <ProviderCard
                  key={provider}
                  provider={provider}
                  integration={byProvider[provider]}
                  onConnect={() => setModal({ provider, existing: null })}
                  onManage={() => setModal({ provider, existing: byProvider[provider] ?? null })}
                />
              ))}
            </div>
          )}
        </section>

        {/* GitHub workspace */}
        {github && github.status === "connected" && <GithubWorkspace integration={github} />}

        {/* Quick send */}
        {showQuickSend && (
          <QuickSendPanel
            slack={slack?.status === "connected" ? slack : undefined}
            discord={discord?.status === "connected" ? discord : undefined}
            notion={notion?.status === "connected" ? notion : undefined}
          />
        )}

        {/* Webhooks */}
        <IncomingWebhooks />
        <OutgoingWebhooks />
      </div>

      {/* Connect / manage modal */}
      <AnimatePresence>
        {modal && (
          <ConnectModal
            key={`${modal.provider}-${modal.existing?.id ?? "new"}`}
            provider={modal.provider}
            existing={modal.existing}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
