/**
 * Mock API — mirrors the real api.ts interface exactly.
 * Used when the backend is unreachable (demo mode).
 */
import {
  DEMO_USER,
  DEMO_TOKEN,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_CONVERSATIONS,
  DEMO_MESSAGES,
  DEMO_MEMORIES,
  DEMO_TASKS,
  DEMO_AGENTS,
  DEMO_ANALYTICS,
  DEMO_DOCUMENTS,
  DEMO_DOCUMENT_CHUNKS,
  getRandomDemoResponse,
} from "./mockData";
import type {
  Message, Memory, Task, Agent, Document, DocumentSearchResult, ReasoningStep,
} from "@/types";

// Simulates realistic network latency
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

// Mutable state so in-session CRUD actually works
let conversations = [...DEMO_CONVERSATIONS];
let messagesStore: Record<string, Message[]> = JSON.parse(JSON.stringify(DEMO_MESSAGES));
let memoriesStore: Memory[] = [...DEMO_MEMORIES];
let tasksStore: Task[] = [...DEMO_TASKS];
const agentsStore: Agent[] = [...DEMO_AGENTS];
let documentsStore: Document[] = JSON.parse(JSON.stringify(DEMO_DOCUMENTS));
// Uploaded-in-session chunks so search also "finds" new files
let documentChunks = [...DEMO_DOCUMENT_CHUNKS];

// Builds a plausible reasoning trace for a simulated assistant reply
function buildDemoTrace(content: string, documentIds?: string[]): ReasoningStep[] {
  const steps: ReasoningStep[] = [
    {
      type: "thinking",
      label: "Analyzing request",
      detail: `Parsed a ${content.trim().split(/\s+/).length}-word prompt and planned the response strategy.`,
    },
  ];
  (documentIds || []).forEach((docId) => {
    const doc = documentsStore.find((d) => d.id === docId);
    if (doc) {
      steps.push({
        type: "retrieval",
        label: `Retrieved ${Math.min(doc.chunk_count, 2 + Math.floor(Math.random() * 3)) || 1} chunks from ${doc.filename}`,
        detail: `Vector search over ${doc.chunk_count} indexed chunks — top score 0.${87 + Math.floor(Math.random() * 10)}.`,
      });
    }
  });
  steps.push({
    type: "thinking",
    label: "Composing answer",
    detail: "Synthesized the final response from working context and retrieved passages.",
  });
  return steps;
}

function ok(data: unknown) {
  return { data, status: 200, statusText: "OK", headers: {}, config: {} as never };
}

export const mockApi = {
  auth: {
    login: async (email: string, password: string) => {
      await delay(600);
      if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
        return ok({ user: DEMO_USER, access_token: DEMO_TOKEN });
      }
      throw Object.assign(new Error("Invalid demo credentials. Use demo@jarvis.ai / jarvis2025"), { status: 401 });
    },
    logout: async () => { await delay(200); return ok({ message: "Logged out" }); },
    me: async () => { await delay(200); return ok(DEMO_USER); },
    refresh: async () => { await delay(200); return ok({ access_token: DEMO_TOKEN }); },
  },

  conversations: {
    list: async () => {
      await delay(300);
      return ok({ items: conversations, total: conversations.length, page: 1, per_page: 20 });
    },
    get: async (id: string) => {
      await delay(200);
      const conv = conversations.find((c) => c.id === id);
      if (!conv) throw Object.assign(new Error("Conversation not found"), { status: 404 });
      return ok({ ...conv, messages: messagesStore[id] || [] });
    },
    create: async (data: { title?: string }) => {
      await delay(400);
      const newConv = {
        id: `conv-${Date.now()}`,
        title: data.title || "New Conversation",
        last_message: "",
        last_message_at: new Date().toISOString(),
        message_count: 0,
        token_count: 0,
        model: "claude-sonnet-4-6",
        created_at: new Date().toISOString(),
        archived: false,
        pinned: false,
        tags: [] as string[],
      };
      conversations = [newConv, ...conversations];
      messagesStore[newConv.id] = [];
      return ok(newConv);
    },
    update: async (id: string, data: Partial<{ title: string; archived: boolean }>) => {
      await delay(200);
      conversations = conversations.map((c) => c.id === id ? { ...c, ...data } : c);
      return ok(conversations.find((c) => c.id === id));
    },
    delete: async (id: string) => {
      await delay(200);
      conversations = conversations.filter((c) => c.id !== id);
      delete messagesStore[id];
      return ok({ message: "Deleted" });
    },
    messages: async (id: string) => {
      await delay(300);
      return ok({ items: messagesStore[id] || [], total: (messagesStore[id] || []).length });
    },
  },

  messages: {
    send: async (conversationId: string, content: string, _model?: string, documentIds?: string[]) => {
      await delay(200);
      const attachedDocs = (documentIds || [])
        .map((id) => documentsStore.find((d) => d.id === id))
        .filter((d): d is Document => Boolean(d))
        .map((d) => ({ id: d.id, filename: d.filename }));
      const userMsg: Message = {
        id: `msg-${Date.now()}-u`,
        conversation_id: conversationId,
        role: "user",
        content,
        status: "complete",
        created_at: new Date().toISOString(),
        document_ids: documentIds,
        attached_documents: attachedDocs.length > 0 ? attachedDocs : undefined,
      };
      if (!messagesStore[conversationId]) messagesStore[conversationId] = [];
      messagesStore[conversationId].push(userMsg);

      // Simulate assistant response after delay
      setTimeout(async () => {
        await delay(800);
        const assistantMsg: Message = {
          id: `msg-${Date.now()}-a`,
          conversation_id: conversationId,
          role: "assistant",
          content: getRandomDemoResponse(),
          status: "complete",
          created_at: new Date().toISOString(),
          meta: {
            steps: buildDemoTrace(content, documentIds),
            model: "claude-sonnet-4-6",
            provider: "anthropic",
          },
        };
        messagesStore[conversationId].push(assistantMsg);
        conversations = conversations.map((c) =>
          c.id === conversationId
            ? { ...c, last_message: assistantMsg.content as string, last_message_at: assistantMsg.created_at, message_count: c.message_count + 2 }
            : c
        );
      }, 0);

      return ok({ user_message_id: userMsg.id, conversation_id: conversationId });
    },
    delete: async (conversationId: string, messageId: string) => {
      await delay(200);
      if (messagesStore[conversationId]) {
        messagesStore[conversationId] = messagesStore[conversationId].filter((m: Message) => m.id !== messageId);
      }
      return ok({ message: "Deleted" });
    },
  },

  documents: {
    upload: async (file: File) => {
      await delay(500);
      const now = new Date().toISOString();
      const doc: Document = {
        id: `doc-${Date.now()}`,
        user_id: DEMO_USER.id,
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        status: "processing",
        chunk_count: 0,
        created_at: now,
        updated_at: now,
      };
      documentsStore = [doc, ...documentsStore];

      // Fake ingestion: flip "processing" -> "ready" after 1.5s
      setTimeout(() => {
        documentsStore = documentsStore.map((d) =>
          d.id === doc.id
            ? {
                ...d,
                status: "ready" as const,
                chunk_count: Math.max(1, Math.round(d.size_bytes / 24_000)),
                updated_at: new Date().toISOString(),
              }
            : d
        );
        documentChunks = [
          ...documentChunks,
          {
            document_id: doc.id,
            filename: doc.filename,
            content: `Demo-indexed content extracted from ${doc.filename}. Start the backend to ingest and search real document text.`,
          },
        ];
      }, 1500);

      return ok(doc);
    },
    list: async () => {
      await delay(300);
      return ok({ items: documentsStore, total: documentsStore.length });
    },
    get: async (id: string) => {
      await delay(200);
      const doc = documentsStore.find((d) => d.id === id);
      if (!doc) throw Object.assign(new Error("Document not found"), { status: 404 });
      return ok(doc);
    },
    delete: async (id: string) => {
      await delay(200);
      documentsStore = documentsStore.filter((d) => d.id !== id);
      documentChunks = documentChunks.filter((c) => c.document_id !== id);
      return ok({ message: "Deleted" });
    },
    search: async (query: string, documentIds?: string[], limit = 8) => {
      await delay(500);
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const readyIds = new Set(
        documentsStore.filter((d) => d.status === "ready").map((d) => d.id)
      );
      const results: DocumentSearchResult[] = documentChunks
        .filter((c) => readyIds.has(c.document_id))
        .filter((c) => !documentIds || documentIds.length === 0 || documentIds.includes(c.document_id))
        .map((c) => {
          const text = c.content.toLowerCase();
          const hits = terms.filter((t) => text.includes(t)).length;
          return {
            content: c.content,
            document_id: c.document_id,
            filename: c.filename,
            score: terms.length > 0 ? Math.min(0.99, 0.45 + (hits / terms.length) * 0.5) : 0.5,
          };
        })
        .filter((r) => terms.length === 0 || r.score > 0.45)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return ok({ results, query, total: results.length });
    },
  },

  execute: {
    run: async (language: string, code: string) => {
      await delay(800);
      const lines = code.split("\n").length;
      return ok({
        stdout: `Demo mode: code execution simulated. Start the backend to run real code.\n[${language}] received ${lines} line${lines === 1 ? "" : "s"} — syntax OK.`,
        stderr: "",
        exit_code: 0,
        duration_ms: 400 + Math.floor(Math.random() * 500),
        truncated: false,
      });
    },
  },

  memory: {
    list: async (params?: { type?: string; search?: string }) => {
      await delay(300);
      let items = [...memoriesStore];
      if (params?.type) items = items.filter((m) => m.type === params.type);
      if (params?.search) {
        const q = params.search.toLowerCase();
        items = items.filter((m) => m.content.toLowerCase().includes(q) || (m.summary ?? "").toLowerCase().includes(q));
      }
      return ok({ items, total: items.length });
    },
    get: async (id: string) => {
      await delay(200);
      const mem = memoriesStore.find((m) => m.id === id);
      if (!mem) throw Object.assign(new Error("Memory not found"), { status: 404 });
      return ok(mem);
    },
    create: async (data: { content: string; type: string; importance: number; tags?: string[] }) => {
      await delay(400);
      const mem: Memory = {
        id: `mem-${Date.now()}`,
        user_id: DEMO_USER.id,
        type: data.type as Memory["type"],
        content: data.content,
        summary: data.content.slice(0, 80),
        importance: Math.max(1, Math.min(5, data.importance)) as Memory["importance"],
        tags: data.tags || [],
        access_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
      };
      memoriesStore = [mem, ...memoriesStore];
      return ok(mem);
    },
    update: async (id: string, data: Partial<Memory>) => {
      await delay(200);
      memoriesStore = memoriesStore.map((m) => m.id === id ? { ...m, ...data } : m);
      return ok(memoriesStore.find((m) => m.id === id));
    },
    delete: async (id: string) => {
      await delay(200);
      memoriesStore = memoriesStore.filter((m) => m.id !== id);
      return ok({ message: "Deleted" });
    },
    search: async (query: string, limit = 5) => {
      await delay(400);
      const q = query.toLowerCase();
      const results = memoriesStore
        .filter((m) => m.content.toLowerCase().includes(q) || m.tags.some((t) => t.includes(q)))
        .slice(0, limit);
      return ok({ items: results, query });
    },
  },

  tasks: {
    list: async (params?: { status?: string }) => {
      await delay(300);
      let items = [...tasksStore];
      if (params?.status) items = items.filter((t) => t.status === params.status);
      return ok({ items, total: items.length });
    },
    get: async (id: string) => {
      await delay(200);
      const task = tasksStore.find((t) => t.id === id);
      if (!task) throw Object.assign(new Error("Task not found"), { status: 404 });
      return ok(task);
    },
    create: async (data: { title: string; description: string; priority?: string }) => {
      await delay(500);
      const task: Task = {
        id: `task-${Date.now()}`,
        user_id: DEMO_USER.id,
        title: data.title,
        description: data.description,
        status: "pending",
        priority: (data.priority as Task["priority"]) || "medium",
        progress: 0,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        steps: [],
      };
      tasksStore = [task, ...tasksStore];
      return ok(task);
    },
    cancel: async (id: string) => {
      await delay(200);
      tasksStore = tasksStore.map((t) =>
        t.id === id ? { ...t, status: "cancelled" as const } : t
      );
      return ok({ message: "Cancelled" });
    },
    delete: async (id: string) => {
      await delay(200);
      tasksStore = tasksStore.filter((t) => t.id !== id);
      return ok({ message: "Deleted" });
    },
  },

  agents: {
    list: async () => { await delay(300); return ok({ items: agentsStore }); },
    get: async (id: string) => {
      await delay(200);
      const agent = agentsStore.find((a) => a.id === id);
      if (!agent) throw Object.assign(new Error("Agent not found"), { status: 404 });
      return ok(agent);
    },
    start: async (id: string) => {
      await delay(300);
      const idx = agentsStore.findIndex((a) => a.id === id);
      if (idx !== -1) agentsStore[idx] = { ...agentsStore[idx], status: "idle" };
      return ok({ message: "Started" });
    },
    stop: async (id: string) => {
      await delay(300);
      const idx = agentsStore.findIndex((a) => a.id === id);
      if (idx !== -1) agentsStore[idx] = { ...agentsStore[idx], status: "idle" };
      return ok({ message: "Stopped" });
    },
  },

  voice: {
    transcribe: async () => {
      await delay(1000);
      return ok({ text: "This is a demo transcription. The voice backend is not running.", confidence: 0.95 });
    },
    synthesize: async () => {
      await delay(500);
      return ok(new Blob([], { type: "audio/mp3" }));
    },
  },

  analytics: {
    usage: async () => { await delay(300); return ok(DEMO_ANALYTICS.usage); },
    daily: async () => { await delay(300); return ok({ items: DEMO_ANALYTICS.daily }); },
    models: async () => { await delay(300); return ok({ items: DEMO_ANALYTICS.models }); },
  },

  withRetry: async <T>(fn: () => Promise<T>) => fn(),
};
