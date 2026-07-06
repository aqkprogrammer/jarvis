"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, Download, X, Layers } from "lucide-react";
import { useArtifactStore } from "@/stores/artifactStore";
import type { Artifact, ArtifactType } from "@/types";
import { Badge } from "@/components/ui/badge";

const PANEL_WIDTH = 460;

const TYPE_LABEL: Record<ArtifactType, string> = {
  html: "HTML",
  svg: "SVG",
  markdown: "MD",
  code: "CODE",
};

function artifactExtension(artifact: Artifact): string {
  switch (artifact.type) {
    case "html":
      return "html";
    case "svg":
      return "svg";
    case "markdown":
      return "md";
    case "code": {
      const map: Record<string, string> = {
        python: "py",
        py: "py",
        javascript: "js",
        js: "js",
        typescript: "ts",
        ts: "ts",
        bash: "sh",
        shell: "sh",
        json: "json",
        css: "css",
        sql: "sql",
      };
      return map[(artifact.language || "").toLowerCase()] || "txt";
    }
  }
}

function artifactMime(type: ArtifactType): string {
  switch (type) {
    case "html":
      return "text/html";
    case "svg":
      return "image/svg+xml";
    default:
      return "text/plain";
  }
}

function ArtifactBody({ artifact }: { artifact: Artifact }) {
  if (artifact.type === "html" || artifact.type === "svg") {
    const srcDoc =
      artifact.type === "svg"
        ? `<!DOCTYPE html><html><head><style>html,body{margin:0;background:#ffffff;min-height:100vh;display:flex;align-items:center;justify-content:center;}</style></head><body>${artifact.content}</body></html>`
        : artifact.content;
    return (
      <iframe
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        title={artifact.title}
        className="w-full h-full border-0 bg-white"
      />
    );
  }

  if (artifact.type === "markdown") {
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="prose-jarvis text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown>
        </div>
      </div>
    );
  }

  // code
  return (
    <div className="h-full overflow-y-auto">
      <SyntaxHighlighter
        language={artifact.language || "text"}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: "1rem",
          background: "#020810",
          fontSize: "0.8125rem",
          lineHeight: "1.6",
          minHeight: "100%",
          fontFamily: "var(--font-mono), JetBrains Mono, monospace",
        }}
        showLineNumbers={artifact.content.split("\n").length > 5}
        lineNumberStyle={{ color: "#2A4A5E", fontSize: "0.75rem" }}
      >
        {artifact.content}
      </SyntaxHighlighter>
    </div>
  );
}

export function ArtifactPanel() {
  const { artifact, close } = useArtifactStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!artifact) return;
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [artifact]);

  const handleDownload = useCallback(() => {
    if (!artifact) return;
    const blob = new Blob([artifact.content], { type: artifactMime(artifact.type) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.title.replace(/[^a-zA-Z0-9._-]+/g, "_") || "artifact"}.${artifactExtension(artifact)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [artifact]);

  return (
    <AnimatePresence>
      {artifact && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: PANEL_WIDTH, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="h-full shrink-0 border-l border-jarvis-border bg-jarvis-surface overflow-hidden"
        >
          <div style={{ width: PANEL_WIDTH }} className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-jarvis-border bg-jarvis-surface/80">
              <Layers className="w-4 h-4 text-primary shrink-0" />
              <span
                className="text-sm font-mono font-semibold text-jarvis-text tracking-wider truncate flex-1"
                title={artifact.title}
              >
                {artifact.title}
              </span>
              <Badge variant="default" className="shrink-0">
                {TYPE_LABEL[artifact.type]}
              </Badge>
              <button
                onClick={handleCopy}
                title="Copy content"
                className="p-1.5 rounded-lg text-jarvis-text-muted hover:text-primary hover:bg-primary/5 transition-colors shrink-0"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                onClick={handleDownload}
                title="Download"
                className="p-1.5 rounded-lg text-jarvis-text-muted hover:text-primary hover:bg-primary/5 transition-colors shrink-0"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={close}
                title="Close"
                className="p-1.5 rounded-lg text-jarvis-text-muted hover:text-red-400 hover:bg-red-500/5 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0">
              <ArtifactBody artifact={artifact} />
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
