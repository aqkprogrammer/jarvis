import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import type {
  WorkflowNode,
  WorkflowEdge,
  ScheduleTargetType,
  IntegrationProvider,
  WebhookEvent,
  WorkspaceRole,
  PushSubscriptionPayload,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Create axios instance
const apiInstance: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Token management
let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

// Request interceptor - inject auth token
apiInstance.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors and token refresh
apiInstance.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      try {
        const newToken = await refreshPromise;
        setAccessToken(newToken);
        if (originalRequest.headers) {
          (originalRequest.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        }
        return apiInstance(originalRequest);
      } catch {
        setAccessToken(null);
        if (typeof window !== "undefined") {
          window.location.href = "/";
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(formatApiError(error));
  }
);

async function refreshAccessToken(): Promise<string> {
  const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {}, {
    withCredentials: true,
  });
  return response.data.access_token;
}

function formatApiError(error: AxiosError): Error & { status?: number; code?: string } {
  const formattedError = new Error(
    (error.response?.data as { message?: string })?.message || error.message || "An error occurred"
  ) as Error & { status?: number; code?: string };
  formattedError.status = error.response?.status;
  formattedError.code = (error.response?.data as { code?: string })?.code;
  return formattedError;
}

// Retry logic with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }
  throw lastError!;
}

// API methods
export const api = {
  // Auth
  auth: {
    login: (email: string, password: string) =>
      apiInstance.post("/api/v1/auth/login", { email, password }),
    logout: () => apiInstance.post("/api/v1/auth/logout"),
    me: () => apiInstance.get("/api/v1/auth/me"),
    refresh: () => apiInstance.post("/api/v1/auth/refresh"),
  },

  // Conversations
  conversations: {
    list: (params?: { page?: number; per_page?: number; archived?: boolean }) =>
      apiInstance.get("/api/v1/conversations", { params }),
    get: (id: string) => apiInstance.get(`/api/v1/conversations/${id}`),
    create: (data: { title?: string; model?: string; system_prompt?: string }) =>
      apiInstance.post("/api/v1/conversations", data),
    update: (id: string, data: Partial<{ title: string; archived: boolean; pinned: boolean; tags: string[] }>) =>
      apiInstance.patch(`/api/v1/conversations/${id}`, data),
    delete: (id: string) => apiInstance.delete(`/api/v1/conversations/${id}`),
    messages: (id: string, params?: { page?: number; per_page?: number }) =>
      apiInstance.get(`/api/v1/conversations/${id}/messages`, { params }),
  },

  // Messages
  messages: {
    send: (conversationId: string, content: string, model?: string, documentIds?: string[]) =>
      apiInstance.post(`/api/v1/conversations/${conversationId}/messages`, {
        content,
        model,
        document_ids: documentIds,
      }),
    delete: (conversationId: string, messageId: string) =>
      apiInstance.delete(`/api/v1/conversations/${conversationId}/messages/${messageId}`),
  },

  // Documents (RAG)
  documents: {
    upload: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiInstance.post("/api/v1/documents/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    list: () => apiInstance.get("/api/v1/documents"),
    get: (id: string) => apiInstance.get(`/api/v1/documents/${id}`),
    delete: (id: string) => apiInstance.delete(`/api/v1/documents/${id}`),
    search: (query: string, documentIds?: string[], limit?: number) =>
      apiInstance.post("/api/v1/documents/search", {
        query,
        document_ids: documentIds,
        limit,
      }),
  },

  // Code execution
  execute: {
    run: (language: string, code: string) =>
      apiInstance.post("/api/v1/execute", { language, code }),
  },

  // Memory
  memory: {
    list: (params?: { page?: number; per_page?: number; type?: string; search?: string }) =>
      apiInstance.get("/api/v1/memory", { params }),
    get: (id: string) => apiInstance.get(`/api/v1/memory/${id}`),
    create: (data: { content: string; type: string; importance: number; tags?: string[] }) =>
      apiInstance.post("/api/v1/memory", data),
    update: (id: string, data: Partial<{ content: string; importance: number; tags: string[] }>) =>
      apiInstance.patch(`/api/v1/memory/${id}`, data),
    delete: (id: string) => apiInstance.delete(`/api/v1/memory/${id}`),
    search: (query: string, limit?: number) =>
      apiInstance.post("/api/v1/memory/search", { query, limit }),
  },

  // Tasks
  tasks: {
    list: (params?: { page?: number; per_page?: number; status?: string }) =>
      apiInstance.get("/api/v1/tasks", { params }),
    get: (id: string) => apiInstance.get(`/api/v1/tasks/${id}`),
    create: (data: { title: string; description: string; priority?: string }) =>
      apiInstance.post("/api/v1/tasks", data),
    cancel: (id: string) => apiInstance.post(`/api/v1/tasks/${id}/cancel`),
    delete: (id: string) => apiInstance.delete(`/api/v1/tasks/${id}`),
  },

  // Agents
  agents: {
    list: () => apiInstance.get("/api/v1/agents"),
    get: (id: string) => apiInstance.get(`/api/v1/agents/${id}`),
    start: (id: string) => apiInstance.post(`/api/v1/agents/${id}/start`),
    stop: (id: string) => apiInstance.post(`/api/v1/agents/${id}/stop`),
  },

  // Voice
  voice: {
    transcribe: (audioBlob: Blob) => {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      return apiInstance.post("/api/v1/voice/transcribe", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    synthesize: (text: string, voice?: string) =>
      apiInstance.post("/api/v1/voice/synthesize", { text, voice }, { responseType: "blob" }),
  },

  // Analytics
  analytics: {
    usage: (params?: { start_date?: string; end_date?: string }) =>
      apiInstance.get("/api/v1/analytics/usage", { params }),
    daily: (params?: { days?: number }) =>
      apiInstance.get("/api/v1/analytics/daily", { params }),
    models: () => apiInstance.get("/api/v1/analytics/models"),
  },

  // Workflows
  workflows: {
    list: () => apiInstance.get("/api/v1/workflows"),
    get: (id: string) => apiInstance.get(`/api/v1/workflows/${id}`),
    create: (data: {
      name: string;
      description?: string;
      nodes: WorkflowNode[];
      edges: WorkflowEdge[];
      is_active?: boolean;
    }) => apiInstance.post("/api/v1/workflows", data),
    update: (
      id: string,
      data: Partial<{
        name: string;
        description: string;
        nodes: WorkflowNode[];
        edges: WorkflowEdge[];
        is_active: boolean;
      }>
    ) => apiInstance.put(`/api/v1/workflows/${id}`, data),
    delete: (id: string) => apiInstance.delete(`/api/v1/workflows/${id}`),
    run: (id: string, input: string) =>
      apiInstance.post(`/api/v1/workflows/${id}/run`, { input }),
    runs: (id: string) => apiInstance.get(`/api/v1/workflows/${id}/runs`),
    getRun: (runId: string) => apiInstance.get(`/api/v1/workflows/runs/${runId}`),
  },

  // Schedules
  schedules: {
    list: () => apiInstance.get("/api/v1/schedules"),
    create: (data: {
      name: string;
      cron: string;
      target_type: ScheduleTargetType;
      workflow_id?: string;
      prompt?: string;
      is_active?: boolean;
    }) => apiInstance.post("/api/v1/schedules", data),
    update: (
      id: string,
      data: Partial<{
        name: string;
        cron: string;
        target_type: ScheduleTargetType;
        workflow_id: string;
        prompt: string;
        is_active: boolean;
      }>
    ) => apiInstance.put(`/api/v1/schedules/${id}`, data),
    delete: (id: string) => apiInstance.delete(`/api/v1/schedules/${id}`),
    toggle: (id: string) => apiInstance.post(`/api/v1/schedules/${id}/toggle`),
    runNow: (id: string) => apiInstance.post(`/api/v1/schedules/${id}/run-now`),
  },

  // API keys
  apikeys: {
    list: () => apiInstance.get("/api/v1/apikeys"),
    create: (name: string) => apiInstance.post("/api/v1/apikeys", { name }),
    revoke: (id: string) => apiInstance.delete(`/api/v1/apikeys/${id}`),
  },

  // Integrations (GitHub, Slack, Discord, Notion)
  integrations: {
    list: () => apiInstance.get("/api/v1/integrations"),
    create: (data: {
      provider: IntegrationProvider;
      name: string;
      credentials: Record<string, string>;
      config?: Record<string, unknown>;
    }) => apiInstance.post("/api/v1/integrations", data),
    update: (
      id: string,
      data: Partial<{
        name: string;
        credentials: Record<string, string>;
        config: Record<string, unknown>;
      }>
    ) => apiInstance.put(`/api/v1/integrations/${id}`, data),
    delete: (id: string) => apiInstance.delete(`/api/v1/integrations/${id}`),
    test: (id: string) => apiInstance.post(`/api/v1/integrations/${id}/test`),
    action: (id: string, action: string, params: Record<string, unknown> = {}) =>
      apiInstance.post(`/api/v1/integrations/${id}/action`, { action, params }),
  },

  // Webhooks (incoming triggers + outgoing event notifications)
  webhooks: {
    listTriggers: () => apiInstance.get("/api/v1/webhooks/triggers"),
    createTrigger: (data: { name: string; workflow_id: string }) =>
      apiInstance.post("/api/v1/webhooks/triggers", data),
    deleteTrigger: (id: string) => apiInstance.delete(`/api/v1/webhooks/triggers/${id}`),
    toggleTrigger: (id: string) => apiInstance.post(`/api/v1/webhooks/triggers/${id}/toggle`),
    listOutgoing: () => apiInstance.get("/api/v1/webhooks/outgoing"),
    createOutgoing: (data: { name: string; url: string; events: WebhookEvent[]; secret?: string }) =>
      apiInstance.post("/api/v1/webhooks/outgoing", data),
    updateOutgoing: (
      id: string,
      data: Partial<{
        name: string;
        url: string;
        events: WebhookEvent[];
        secret: string;
        is_active: boolean;
      }>
    ) => apiInstance.put(`/api/v1/webhooks/outgoing/${id}`, data),
    deleteOutgoing: (id: string) => apiInstance.delete(`/api/v1/webhooks/outgoing/${id}`),
    testOutgoing: (id: string) => apiInstance.post(`/api/v1/webhooks/outgoing/${id}/test`),
  },

  // Workspaces (team collaboration)
  workspaces: {
    list: () => apiInstance.get("/api/v1/workspaces"),
    create: (data: { name: string }) => apiInstance.post("/api/v1/workspaces", data),
    update: (id: string, data: { name: string }) =>
      apiInstance.put(`/api/v1/workspaces/${id}`, data),
    delete: (id: string) => apiInstance.delete(`/api/v1/workspaces/${id}`),
    members: (id: string) => apiInstance.get(`/api/v1/workspaces/${id}/members`),
    removeMember: (id: string, userId: string) =>
      apiInstance.delete(`/api/v1/workspaces/${id}/members/${userId}`),
    setRole: (id: string, userId: string, role: WorkspaceRole) =>
      apiInstance.put(`/api/v1/workspaces/${id}/members/${userId}`, { role }),
    createInvite: (id: string, data: { email: string; role: WorkspaceRole }) =>
      apiInstance.post(`/api/v1/workspaces/${id}/invites`, data),
    listInvites: (id: string) => apiInstance.get(`/api/v1/workspaces/${id}/invites`),
    revokeInvite: (id: string, inviteId: string) =>
      apiInstance.delete(`/api/v1/workspaces/${id}/invites/${inviteId}`),
    acceptInvite: (token: string) =>
      apiInstance.post("/api/v1/workspaces/invites/accept", { token }),
    shareConversation: (id: string, conversationId: string) =>
      apiInstance.post(`/api/v1/workspaces/${id}/share-conversation`, {
        conversation_id: conversationId,
      }),
    unshareConversation: (id: string, conversationId: string) =>
      apiInstance.post(`/api/v1/workspaces/${id}/unshare-conversation`, {
        conversation_id: conversationId,
      }),
    sharedConversations: (id: string) =>
      apiInstance.get(`/api/v1/workspaces/${id}/conversations`),
  },

  // Usage & costs (current user)
  usage: {
    summary: () => apiInstance.get("/api/v1/usage/summary"),
    daily: (params?: { days?: number }) =>
      apiInstance.get("/api/v1/usage/daily", { params }),
    byModel: (params?: { days?: number }) =>
      apiInstance.get("/api/v1/usage/by-model", { params }),
    topConversations: (params?: { days?: number }) =>
      apiInstance.get("/api/v1/usage/top-conversations", { params }),
  },

  // Audit log (current user)
  audit: {
    list: (params?: {
      action?: string;
      resource_type?: string;
      q?: string;
      from?: string;
      to?: string;
      limit?: number;
      offset?: number;
    }) => apiInstance.get("/api/v1/audit", { params }),
  },

  // Admin (requires is_admin)
  admin: {
    stats: () => apiInstance.get("/api/v1/admin/stats"),
    users: (params?: { q?: string; limit?: number; offset?: number }) =>
      apiInstance.get("/api/v1/admin/users", { params }),
    updateUser: (
      id: string,
      data: { is_active?: boolean; is_admin?: boolean; monthly_token_quota?: number | null }
    ) => apiInstance.put(`/api/v1/admin/users/${id}`, data),
    usageDaily: (params?: { days?: number }) =>
      apiInstance.get("/api/v1/admin/usage/daily", { params }),
    audit: (params?: { user_id?: string; action?: string; limit?: number; offset?: number }) =>
      apiInstance.get("/api/v1/admin/audit", { params }),
  },

  // Web push notifications
  push: {
    vapidKey: () => apiInstance.get("/api/v1/push/vapid-public-key"),
    subscribe: (data: PushSubscriptionPayload) =>
      apiInstance.post("/api/v1/push/subscribe", data),
    unsubscribe: (endpoint: string) =>
      apiInstance.delete("/api/v1/push/unsubscribe", { data: { endpoint } }),
  },

  // Utility
  withRetry,
};

export default apiInstance;

// ─── Demo-mode aware API getter ───────────────────────────────────────────────
// Components should call getApi() instead of importing `api` directly when
// they want automatic fallback to mock data when the backend is unavailable.

let _demoMode: boolean | null = null;

export function setDemoMode(demo: boolean) {
  _demoMode = demo;
}

export function isDemoMode(): boolean {
  return _demoMode === true;
}

export function getApi(): typeof api {
  if (_demoMode) {
    // Dynamically import to avoid bundling mock data in production builds
    // In practice it's always available since we're in the same bundle
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { mockApi } = require("./mockApi") as { mockApi: typeof api };
    return mockApi;
  }
  return api;
}
