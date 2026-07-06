import { Github, Slack, MessageSquare, BookOpen, type LucideIcon } from "lucide-react";
import type { IntegrationProvider } from "@/types";

export interface ProviderMeta {
  label: string;
  icon: LucideIcon;
  description: string;
  namePlaceholder: string;
}

export const PROVIDER_META: Record<IntegrationProvider, ProviderMeta> = {
  github: {
    label: "GitHub",
    icon: Github,
    description: "Repos, pull requests and issues",
    namePlaceholder: "e.g. Personal GitHub",
  },
  slack: {
    label: "Slack",
    icon: Slack,
    description: "Send messages to your workspace",
    namePlaceholder: "e.g. Team Slack",
  },
  discord: {
    label: "Discord",
    icon: MessageSquare,
    description: "Post to channels via webhook",
    namePlaceholder: "e.g. Guild Server",
  },
  notion: {
    label: "Notion",
    icon: BookOpen,
    description: "Create pages in your workspace",
    namePlaceholder: "e.g. Personal Notion",
  },
};

export const PROVIDER_ORDER: IntegrationProvider[] = ["github", "slack", "discord", "notion"];

/** Unwraps list responses that may be a raw array or an {items}/{data} envelope. */
export function extractItems<T>(data: unknown): T[] {
  const d = data as { items?: T[]; data?: T[] } | T[];
  const items = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
  return Array.isArray(items) ? items : [];
}

/** Unwraps `POST /integrations/{id}/action` responses: `{ result }` envelope or raw payload. */
export function extractResult<T>(data: unknown): T {
  if (data && typeof data === "object" && "result" in data) {
    return (data as { result: T }).result;
  }
  return data as T;
}

/** Safely reads a string value out of an integration's untyped config object. */
export function configString(config: Record<string, unknown> | undefined, key: string): string {
  const value = config?.[key];
  return typeof value === "string" ? value : "";
}
