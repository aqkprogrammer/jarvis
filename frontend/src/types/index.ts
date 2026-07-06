// ==================== USER TYPES ====================
export interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: "dark" | "light" | "system";
  language: string;
  voice_enabled: boolean;
  default_model: string;
  notifications_enabled: boolean;
  auto_speak: boolean;
  push_to_talk: boolean;
}

// ==================== MESSAGE TYPES ====================
export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageStatus = "sending" | "streaming" | "complete" | "error";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: "pending" | "running" | "complete" | "error";
  started_at?: string;
  completed_at?: string;
}

export interface MessageContent {
  type: "text" | "image" | "tool_use" | "tool_result";
  text?: string;
  image_url?: string;
  tool_call?: ToolCall;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string | MessageContent[];
  tool_calls?: ToolCall[];
  status: MessageStatus;
  model?: string;
  tokens?: {
    input: number;
    output: number;
  };
  created_at: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
}

// ==================== CONVERSATION TYPES ====================
export interface Conversation {
  id: string;
  title: string;
  user_id: string;
  model: string;
  system_prompt?: string;
  messages: Message[];
  message_count: number;
  token_count: number;
  created_at: string;
  updated_at: string;
  archived: boolean;
  pinned: boolean;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  message_count: number;
  token_count: number;
  last_message?: string;
  last_message_at: string;
  created_at: string;
  archived: boolean;
  pinned: boolean;
  tags: string[];
}

// ==================== MEMORY TYPES ====================
export type MemoryType = "fact" | "preference" | "event" | "skill" | "context";
export type ImportanceLevel = 1 | 2 | 3 | 4 | 5;

export interface Memory {
  id: string;
  user_id: string;
  type: MemoryType;
  content: string;
  summary?: string;
  importance: ImportanceLevel;
  tags: string[];
  source_conversation_id?: string;
  source_message_id?: string;
  embedding_id?: string;
  created_at: string;
  updated_at: string;
  last_accessed?: string;
  access_count: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchResult {
  memory: Memory;
  score: number;
  highlights?: string[];
}

// ==================== TASK TYPES ====================
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "paused";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface TaskStep {
  id: string;
  description: string;
  status: TaskStatus;
  output?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  steps: TaskStep[];
  agent_id?: string;
  conversation_id?: string;
  tags: string[];
  due_date?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  result?: string;
  metadata?: Record<string, unknown>;
}

// ==================== AGENT TYPES ====================
export type AgentStatus = "idle" | "running" | "paused" | "error" | "offline";

export interface Agent {
  id: string;
  name: string;
  type: string;
  description: string;
  status: AgentStatus;
  capabilities: string[];
  current_task_id?: string;
  tasks_completed: number;
  tasks_failed: number;
  uptime_seconds: number;
  last_active?: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

// ==================== API RESPONSE TYPES ====================
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  status: number;
}

// ==================== WEBSOCKET EVENT TYPES ====================
export type WSEventType =
  | "message.chunk"
  | "message.complete"
  | "message.error"
  | "tool.start"
  | "tool.complete"
  | "tool.error"
  | "task.update"
  | "task.complete"
  | "task.error"
  | "agent.status"
  | "notification"
  | "ping"
  | "pong";

export interface WSEvent {
  type: WSEventType;
  data: unknown;
  timestamp: string;
  conversation_id?: string;
  message_id?: string;
  task_id?: string;
  agent_id?: string;
}

export interface MessageChunkEvent {
  conversation_id: string;
  message_id: string;
  chunk: string;
  index: number;
}

export interface MessageCompleteEvent {
  conversation_id: string;
  message_id: string;
  message: Message;
}

export interface TaskUpdateEvent {
  task_id: string;
  status: TaskStatus;
  progress: number;
  step?: TaskStep;
  message?: string;
}

// ==================== ANALYTICS TYPES ====================
export interface UsageStats {
  total_messages: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  total_conversations: number;
  total_memories: number;
  total_tasks: number;
  tasks_completed: number;
  tasks_failed: number;
  period_start: string;
  period_end: string;
}

export interface DailyUsage {
  date: string;
  messages: number;
  tokens: number;
  conversations: number;
}

export interface ModelUsage {
  model: string;
  messages: number;
  tokens: number;
  percentage: number;
}

// ==================== NOTIFICATION TYPES ====================
export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  action_url?: string;
  created_at: string;
}

// ==================== VOICE TYPES ====================
export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

export interface VoiceSession {
  id: string;
  state: VoiceState;
  transcript?: string;
  confidence?: number;
  audio_url?: string;
  duration?: number;
}

// ==================== STREAMING TYPES ====================
export interface StreamingState {
  isStreaming: boolean;
  conversationId?: string;
  messageId?: string;
  content: string;
  toolCalls: ToolCall[];
}
