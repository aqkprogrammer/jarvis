import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import type { WorkflowNode, WorkflowEdge, ScheduleTargetType } from "@/types";

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
