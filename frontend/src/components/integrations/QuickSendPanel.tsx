"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, Check, ExternalLink, FilePlus2, Loader2, Send, Zap } from "lucide-react";
import { getApi } from "@/lib/api";
import { cn } from "@/components/ui/button";
import { PROVIDER_META, configString, extractResult } from "./shared";
import type { Integration } from "@/types";

interface Feedback {
  kind: "success" | "error";
  message: string;
}

function useTransientFeedback(): [Feedback | null, (f: Feedback | null) => void] {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);
  return [feedback, setFeedback];
}

function FeedbackLine({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-[11px] font-mono",
        feedback.kind === "success" ? "text-emerald-400" : "text-red-400"
      )}
    >
      {feedback.kind === "success" ? (
        <Check className="w-3 h-3" />
      ) : (
        <AlertTriangle className="w-3 h-3" />
      )}
      {feedback.message}
    </p>
  );
}

function MessengerSend({
  integration,
  kind,
}: {
  integration: Integration;
  kind: "slack" | "discord";
}) {
  const meta = PROVIDER_META[kind];
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useTransientFeedback();
  const defaultChannel = configString(integration.config, "default_channel");

  const sendMutation = useMutation({
    mutationFn: async () => {
      const params =
        kind === "slack"
          ? { text: text.trim(), ...(defaultChannel ? { channel: defaultChannel } : {}) }
          : { content: text.trim() };
      const response = await getApi().integrations.action(integration.id, "send_message", params);
      return extractResult<{ ok: boolean }>(response.data);
    },
    onSuccess: () => {
      setText("");
      setFeedback({
        kind: "success",
        message: `Message sent${kind === "slack" && defaultChannel ? ` to ${defaultChannel}` : ""}`,
      });
    },
    onError: (error) => setFeedback({ kind: "error", message: (error as Error).message }),
  });

  return (
    <div className="jarvis-card p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <meta.icon className="w-4 h-4 text-primary" />
        <p className="text-xs font-mono uppercase tracking-wider text-jarvis-text">
          {meta.label}
        </p>
        <span className="text-[10px] font-mono text-jarvis-text-muted truncate">
          {integration.name}
          {kind === "slack" && defaultChannel ? ` · ${defaultChannel}` : ""}
        </span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="jarvis-input w-full text-sm min-h-20 resize-none"
        rows={3}
        placeholder={`Send a message via ${meta.label}...`}
      />
      <div className="flex items-center justify-between gap-3">
        <FeedbackLine feedback={feedback} />
        <button
          onClick={() => sendMutation.mutate()}
          disabled={text.trim().length === 0 || sendMutation.isPending}
          className="ml-auto flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-mono hover:bg-primary/20 transition-all disabled:opacity-50"
        >
          {sendMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          {sendMutation.isPending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}

function NotionCreatePage({ integration }: { integration: Integration }) {
  const meta = PROVIDER_META.notion;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [feedback, setFeedback] = useTransientFeedback();
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await getApi().integrations.action(integration.id, "create_page", {
        title: title.trim(),
        content: content.trim(),
      });
      return extractResult<{ id: string; url?: string }>(response.data);
    },
    onSuccess: (page) => {
      setTitle("");
      setContent("");
      setCreatedUrl(page.url ?? null);
      setFeedback({ kind: "success", message: "Page created" });
    },
    onError: (error) => {
      setCreatedUrl(null);
      setFeedback({ kind: "error", message: (error as Error).message });
    },
  });

  return (
    <div className="jarvis-card p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <meta.icon className="w-4 h-4 text-primary" />
        <p className="text-xs font-mono uppercase tracking-wider text-jarvis-text">Notion</p>
        <span className="text-[10px] font-mono text-jarvis-text-muted truncate">
          {integration.name}
        </span>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="jarvis-input w-full text-sm"
        placeholder="Page title"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="jarvis-input w-full text-sm min-h-[52px] resize-none"
        rows={2}
        placeholder="Page content"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 min-w-0">
          <FeedbackLine feedback={feedback} />
          {feedback?.kind === "success" && createdUrl && (
            <a
              href={createdUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-mono text-primary hover:underline shrink-0"
            >
              open <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </span>
        <button
          onClick={() => createMutation.mutate()}
          disabled={title.trim().length === 0 || createMutation.isPending}
          className="ml-auto flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-mono hover:bg-primary/20 transition-all disabled:opacity-50 shrink-0"
        >
          {createMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FilePlus2 className="w-3.5 h-3.5" />
          )}
          {createMutation.isPending ? "Creating..." : "Create Page"}
        </button>
      </div>
    </div>
  );
}

export function QuickSendPanel({
  slack,
  discord,
  notion,
}: {
  slack?: Integration;
  discord?: Integration;
  notion?: Integration;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-primary" />
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-jarvis-text-muted">
          Quick Send
        </h2>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        {slack && <MessengerSend integration={slack} kind="slack" />}
        {discord && <MessengerSend integration={discord} kind="discord" />}
        {notion && <NotionCreatePage integration={notion} />}
      </motion.div>
    </section>
  );
}
