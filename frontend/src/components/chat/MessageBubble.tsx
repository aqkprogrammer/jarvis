"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Copy, Check, Trash2, RefreshCw, ChevronDown, ChevronRight,
  Terminal, User, Bot, AlertCircle, Clock, Eye, Play, Loader2,
  BrainCircuit, Brain, Wrench, FileSearch, FileText
} from "lucide-react";
import { Message, MessageMeta, ToolCall, ExecuteResult, ReasoningStepType } from "@/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { getApi } from "@/lib/api";
import { useArtifactStore } from "@/stores/artifactStore";

interface MessageBubbleProps {
  message: Message;
  onDelete?: (id: string) => void;
  onRetry?: (id: string) => void;
  isStreaming?: boolean;
}

function ToolCallDisplay({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-2 rounded-lg border border-jarvis-border bg-jarvis-surface/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-primary/5 transition-colors"
      >
        <Terminal className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs font-mono text-primary font-semibold">{toolCall.name}</span>
        <Badge
          variant={
            toolCall.status === "complete" ? "success" :
            toolCall.status === "error" ? "danger" :
            toolCall.status === "running" ? "running" : "muted"
          }
          dot
          className="ml-auto"
        >
          {toolCall.status}
        </Badge>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-jarvis-text-muted ml-1" /> : <ChevronRight className="w-3.5 h-3.5 text-jarvis-text-muted ml-1" />}
      </button>
      {expanded && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: "auto" }}
          className="border-t border-jarvis-border"
        >
          {Object.keys(toolCall.input).length > 0 && (
            <div className="px-3 py-2">
              <p className="text-xs font-mono text-jarvis-text-muted mb-1">Input:</p>
              <pre className="text-xs text-jarvis-text font-mono bg-jarvis-bg/80 rounded p-2 overflow-x-auto">
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.output && (
            <div className="px-3 py-2 border-t border-jarvis-border/50">
              <p className="text-xs font-mono text-jarvis-text-muted mb-1">Output:</p>
              <pre className="text-xs text-jarvis-text font-mono bg-jarvis-bg/80 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                {toolCall.output}
              </pre>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

const PREVIEWABLE_LANGUAGES = new Set(["html", "svg", "xml"]);
const RUNNABLE_LANGUAGES = new Set(["python", "py", "javascript", "js"]);

function normalizeRunLanguage(language: string): string {
  if (language === "py") return "python";
  if (language === "js") return "javascript";
  return language;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [execResult, setExecResult] = useState<ExecuteResult | null>(null);
  const [outputOpen, setOutputOpen] = useState(true);
  const openArtifact = useArtifactStore((s) => s.open);

  const lang = (language || "").toLowerCase();
  const canPreview = PREVIEWABLE_LANGUAGES.has(lang);
  const canRun = RUNNABLE_LANGUAGES.has(lang);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePreview = () => {
    const isSvg = lang === "svg" || (lang === "xml" && code.toLowerCase().includes("<svg"));
    openArtifact({
      type: isSvg ? "svg" : "html",
      title: `${(isSvg ? "svg" : "html").toUpperCase()} Preview`,
      content: code,
      language: lang,
    });
  };

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    try {
      const response = await getApi().execute.run(normalizeRunLanguage(lang), code);
      setExecResult(response.data as ExecuteResult);
    } catch (error) {
      setExecResult({
        stdout: "",
        stderr: (error as Error).message || "Execution failed",
        exit_code: 1,
        duration_ms: 0,
        truncated: false,
      });
    } finally {
      setRunning(false);
      setOutputOpen(true);
    }
  };

  return (
    <div className="relative my-3 rounded-xl overflow-hidden border border-jarvis-border">
      <div className="flex items-center justify-between px-4 py-2 bg-jarvis-surface border-b border-jarvis-border">
        <span className="text-xs font-mono text-jarvis-text-muted">{language || "code"}</span>
        <div className="flex items-center gap-3">
          {canPreview && (
            <button
              onClick={handlePreview}
              className="flex items-center gap-1.5 text-xs font-mono text-jarvis-text-muted hover:text-primary transition-colors"
              title="Preview in artifact panel"
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
            </button>
          )}
          {canRun && (
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-1.5 text-xs font-mono text-jarvis-text-muted hover:text-emerald-400 transition-colors disabled:opacity-60"
              title="Execute code"
            >
              {running ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {running ? "Running..." : "Run"}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs font-mono text-jarvis-text-muted hover:text-primary transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: "1rem",
          background: "#020810",
          fontSize: "0.8125rem",
          lineHeight: "1.6",
          fontFamily: "var(--font-mono), JetBrains Mono, monospace",
        }}
        showLineNumbers={code.split("\n").length > 5}
        lineNumberStyle={{ color: "#2A4A5E", fontSize: "0.75rem" }}
      >
        {code}
      </SyntaxHighlighter>

      {/* Execution output console */}
      {execResult && (
        <div className="border-t border-jarvis-border bg-[#020810]">
          <button
            onClick={() => setOutputOpen(!outputOpen)}
            className="w-full flex items-center gap-2 px-4 py-2 hover:bg-primary/5 transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-[10px] font-mono font-semibold text-jarvis-text-muted uppercase tracking-wider">
              Output
            </span>
            {outputOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-jarvis-text-muted ml-auto" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-jarvis-text-muted ml-auto" />
            )}
          </button>
          <AnimatePresence initial={false}>
            {outputOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-3">
                  {execResult.stdout && (
                    <pre className="text-xs font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed">
                      {execResult.stdout}
                    </pre>
                  )}
                  {execResult.stderr && (
                    <pre className="text-xs font-mono text-red-400 whitespace-pre-wrap leading-relaxed mt-1">
                      {execResult.stderr}
                    </pre>
                  )}
                  {!execResult.stdout && !execResult.stderr && (
                    <p className="text-xs font-mono text-jarvis-text-muted italic">(no output)</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-jarvis-border/50 text-[10px] font-mono text-jarvis-text-muted">
                    <span className={cn(execResult.exit_code === 0 ? "text-emerald-400" : "text-red-400")}>
                      exit {execResult.exit_code}
                    </span>
                    <span>{execResult.duration_ms}ms</span>
                    {execResult.truncated && <span className="text-amber-400">output truncated</span>}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

const reasoningStepConfig: Record<ReasoningStepType, { icon: typeof Brain; color: string }> = {
  thinking: { icon: Brain, color: "text-violet-400" },
  tool: { icon: Wrench, color: "text-amber-400" },
  retrieval: { icon: FileSearch, color: "text-primary" },
};

function ReasoningTrace({ meta }: { meta: MessageMeta }) {
  const [expanded, setExpanded] = useState(false);
  const steps = meta.steps || [];
  if (steps.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-primary/15 bg-primary/[0.03] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-primary/5 transition-colors"
      >
        <BrainCircuit className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-[10px] font-mono font-semibold text-primary uppercase tracking-wider">
          Reasoning
        </span>
        <span className="text-[10px] font-mono text-jarvis-text-muted">
          {steps.length} step{steps.length === 1 ? "" : "s"}
        </span>
        {(meta.model || meta.provider) && (
          <span className="text-[10px] font-mono text-jarvis-text-muted/60 ml-auto hidden sm:inline truncate">
            {[meta.model, meta.provider].filter(Boolean).join(" · ")}
          </span>
        )}
        {expanded ? (
          <ChevronDown className={cn("w-3.5 h-3.5 text-jarvis-text-muted shrink-0", !meta.model && !meta.provider && "ml-auto")} />
        ) : (
          <ChevronRight className={cn("w-3.5 h-3.5 text-jarvis-text-muted shrink-0", !meta.model && !meta.provider && "ml-auto")} />
        )}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1">
              <div className="ml-1.5 border-l border-primary/30 pl-3 space-y-3">
                {steps.map((step, i) => {
                  const config = reasoningStepConfig[step.type];
                  const StepIcon = config.icon;
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <StepIcon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", config.color)} />
                      <div className="min-w-0">
                        <p className="text-xs font-mono font-semibold text-jarvis-text leading-snug">
                          {step.label}
                        </p>
                        <p className="text-xs font-mono text-jarvis-text-muted mt-0.5 leading-relaxed">
                          {step.detail}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MessageBubble({ message, onDelete, onRetry, isStreaming }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const isUser = message.role === "user";
  const textContent = typeof message.content === 'string'
    ? message.content
    : message.content
        .filter((b) => b.type === 'text')
        .map((b) => ('text' in b ? b.text : ''))
        .join('\n');
  const content = textContent;
  const toolCalls = message.tool_calls || [];
  const attachments =
    message.attached_documents ??
    (message.document_ids || []).map((id) => ({ id, filename: id }));

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex gap-3 group",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1",
        isUser
          ? "bg-primary/10 border border-primary/30"
          : "bg-jarvis-surface border border-jarvis-border animate-pulse-glow"
      )}>
        {isUser
          ? <User className="w-4 h-4 text-primary" />
          : <Bot className="w-4 h-4 text-primary" />
        }
      </div>

      {/* Content */}
      <div className={cn(
        "flex flex-col gap-1 max-w-[80%]",
        isUser ? "items-end" : "items-start"
      )}>
        {/* Bubble */}
        <div className={cn(
          "rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-primary/10 border border-primary/20 text-jarvis-text rounded-tr-sm"
            : "glass border border-jarvis-border text-jarvis-text rounded-tl-sm",
          message.status === "error" && "border-red-500/30 bg-red-500/5"
        )}>
          {message.status === "error" && (
            <div className="flex items-center gap-2 text-red-400 text-xs font-mono mb-2 pb-2 border-b border-red-500/20">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Error occurred</span>
            </div>
          )}

          {/* Reasoning trace (assistant messages) */}
          {!isUser && message.meta?.steps && message.meta.steps.length > 0 && (
            <ReasoningTrace meta={message.meta} />
          )}

          {/* Attached document chips */}
          {attachments.length > 0 && (
            <div className={cn("flex flex-wrap gap-1.5", (content || toolCalls.length > 0) && "mb-2")}>
              {attachments.map((doc) => (
                <span
                  key={doc.id}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-primary/5 border border-primary/20 text-primary/80"
                  title={doc.filename}
                >
                  <FileText className="w-2.5 h-2.5 shrink-0" />
                  <span className="max-w-40 truncate">{doc.filename}</span>
                </span>
              ))}
            </div>
          )}

          {/* Tool calls */}
          {toolCalls.map((tc) => (
            <ToolCallDisplay key={tc.id} toolCall={tc} />
          ))}

          {/* Main content */}
          {content && (
            isUser ? (
              <p className="whitespace-pre-wrap font-sans">{content}</p>
            ) : (
              <div className={cn("prose-jarvis", isStreaming && !content.endsWith(" ") && "streaming-cursor")}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const code = String(children).replace(/\n$/, "");
                      const isBlock = code.includes("\n") || (match && code.length > 60);
                      return isBlock ? (
                        <CodeBlock code={code} language={match?.[1] || "text"} />
                      ) : (
                        <code className={className} {...props}>{children}</code>
                      );
                    },
                    pre({ children }) {
                      return <>{children}</>;
                    },
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            )
          )}

          {/* Streaming indicator */}
          {isStreaming && !content && (
            <div className="flex items-center gap-1 py-1 loading-dots">
              <span className="w-1.5 h-1.5 bg-primary rounded-full inline-block" />
              <span className="w-1.5 h-1.5 bg-primary rounded-full inline-block" />
              <span className="w-1.5 h-1.5 bg-primary rounded-full inline-block" />
            </div>
          )}
        </div>

        {/* Metadata row */}
        <div className={cn(
          "flex items-center gap-3 text-xs font-mono text-jarvis-text-muted px-1",
          isUser ? "flex-row-reverse" : "flex-row"
        )}>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
          </span>
          {message.tokens && (
            <span className="text-primary/60">{message.tokens.output} tokens</span>
          )}
          {message.model && (
            <span className="hidden sm:inline opacity-60">{message.model}</span>
          )}

          {/* Actions */}
          <div className={cn(
            "flex items-center gap-1 transition-all duration-200",
            showActions ? "opacity-100" : "opacity-0"
          )}>
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:text-primary hover:bg-primary/5 transition-colors"
              title="Copy"
            >
              {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
            </button>
            {!isUser && onRetry && (
              <button
                onClick={() => onRetry(message.id)}
                className="p-1 rounded hover:text-primary hover:bg-primary/5 transition-colors"
                title="Retry"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(message.id)}
                className="p-1 rounded hover:text-red-400 hover:bg-red-500/5 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
