"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Copy, Check, Trash2, RefreshCw, ChevronDown, ChevronRight,
  Terminal, User, Bot, AlertCircle, Clock
} from "lucide-react";
import { Message, ToolCall } from "@/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

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

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-3 rounded-xl overflow-hidden border border-jarvis-border">
      <div className="flex items-center justify-between px-4 py-2 bg-jarvis-surface border-b border-jarvis-border">
        <span className="text-xs font-mono text-jarvis-text-muted">{language || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs font-mono text-jarvis-text-muted hover:text-primary transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied!" : "Copy"}
        </button>
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
