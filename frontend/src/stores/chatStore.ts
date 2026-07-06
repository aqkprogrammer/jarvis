import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  Conversation,
  ConversationSummary,
  Message,
  StreamingState,
} from "@/types";
import { api } from "@/lib/api";

interface ChatState {
  conversations: ConversationSummary[];
  currentConversation: Conversation | null;
  messages: Message[];
  streaming: StreamingState;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;
  selectedModel: string;
  searchQuery: string;

  // Actions
  loadConversations: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  createConversation: (title?: string, model?: string) => Promise<Conversation>;
  updateConversation: (id: string, data: Partial<ConversationSummary>) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  appendStreamChunk: (messageId: string, chunk: string) => void;
  completeStreaming: (messageId: string, message: Message) => void;
  startStreaming: (conversationId: string, messageId: string) => void;
  stopStreaming: () => void;
  setSelectedModel: (model: string) => void;
  setSearchQuery: (query: string) => void;
  addOptimisticMessage: (message: Message) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
}

export const useChatStore = create<ChatState>()(
  immer((set, get) => ({
    conversations: [],
    currentConversation: null,
    messages: [],
    streaming: {
      isStreaming: false,
      conversationId: undefined,
      messageId: undefined,
      content: "",
      toolCalls: [],
    },
    isLoadingConversations: false,
    isLoadingMessages: false,
    isSending: false,
    selectedModel: "claude-3-5-sonnet-20241022",
    searchQuery: "",

    loadConversations: async () => {
      set((state) => { state.isLoadingConversations = true; });
      try {
        const response = await api.conversations.list();
        set((state) => {
          state.conversations = response.data.data || response.data;
          state.isLoadingConversations = false;
        });
      } catch (error) {
        set((state) => { state.isLoadingConversations = false; });
        throw error;
      }
    },

    loadConversation: async (id: string) => {
      set((state) => { state.isLoadingMessages = true; });
      try {
        const [convResponse, msgResponse] = await Promise.all([
          api.conversations.get(id),
          api.conversations.messages(id),
        ]);
        set((state) => {
          state.currentConversation = convResponse.data;
          state.messages = msgResponse.data.data || msgResponse.data;
          state.isLoadingMessages = false;
        });
      } catch (error) {
        set((state) => { state.isLoadingMessages = false; });
        throw error;
      }
    },

    createConversation: async (title?: string, model?: string) => {
      const response = await api.conversations.create({
        title: title || "New Conversation",
        model: model || get().selectedModel,
      });
      const newConv = response.data;
      set((state) => {
        state.conversations.unshift({
          id: newConv.id,
          title: newConv.title,
          model: newConv.model,
          message_count: 0,
          token_count: 0,
          last_message_at: newConv.created_at,
          created_at: newConv.created_at,
          archived: false,
          pinned: false,
          tags: [],
        });
        state.currentConversation = newConv;
        state.messages = [];
      });
      return newConv;
    },

    updateConversation: async (id: string, data: Partial<ConversationSummary>) => {
      await api.conversations.update(id, data);
      set((state) => {
        const idx = state.conversations.findIndex((c: ConversationSummary) => c.id === id);
        if (idx !== -1) {
          Object.assign(state.conversations[idx], data);
        }
        if (state.currentConversation?.id === id) {
          Object.assign(state.currentConversation, data);
        }
      });
    },

    deleteConversation: async (id: string) => {
      await api.conversations.delete(id);
      set((state) => {
        state.conversations = state.conversations.filter((c: ConversationSummary) => c.id !== id);
        if (state.currentConversation?.id === id) {
          state.currentConversation = null;
          state.messages = [];
        }
      });
    },

    sendMessage: async (content: string) => {
      const { currentConversation, selectedModel } = get();
      if (!currentConversation) return;

      const tempId = `temp-${Date.now()}`;
      const userMessage: Message = {
        id: tempId,
        conversation_id: currentConversation.id,
        role: "user",
        content,
        status: "complete",
        created_at: new Date().toISOString(),
      };

      set((state) => {
        state.messages.push(userMessage);
        state.isSending = true;
      });

      try {
        const response = await api.messages.send(
          currentConversation.id,
          content,
          selectedModel
        );
        set((state) => {
          const idx = state.messages.findIndex((m: Message) => m.id ===tempId);
          if (idx !== -1) {
            state.messages[idx].id = response.data.user_message_id || tempId;
          }
          state.isSending = false;
        });
      } catch (error) {
        set((state) => {
          const idx = state.messages.findIndex((m: Message) => m.id ===tempId);
          if (idx !== -1) {
            state.messages[idx].status = "error";
          }
          state.isSending = false;
        });
        throw error;
      }
    },

    deleteMessage: async (messageId: string) => {
      const { currentConversation } = get();
      if (!currentConversation) return;
      await api.messages.delete(currentConversation.id, messageId);
      set((state) => {
        state.messages = state.messages.filter((m: Message) => m.id !== messageId);
      });
    },

    appendStreamChunk: (messageId: string, chunk: string) => {
      set((state) => {
        state.streaming.content += chunk;
        const msgIdx = state.messages.findIndex((m: Message) => m.id ===messageId);
        if (msgIdx !== -1) {
          const msg = state.messages[msgIdx];
          state.messages[msgIdx] = {
            ...msg,
            content: (typeof msg.content === "string" ? msg.content : "") + chunk,
            status: "streaming",
          };
        } else {
          // Add streaming placeholder
          state.messages.push({
            id: messageId,
            conversation_id: state.streaming.conversationId || "",
            role: "assistant",
            content: chunk,
            status: "streaming",
            created_at: new Date().toISOString(),
          });
        }
      });
    },

    completeStreaming: (messageId: string, message: Message) => {
      set((state) => {
        const idx = state.messages.findIndex((m: Message) => m.id ===messageId);
        if (idx !== -1) {
          state.messages[idx] = { ...message, status: "complete" };
        }
        state.streaming = {
          isStreaming: false,
          content: "",
          toolCalls: [],
        };
      });
    },

    startStreaming: (conversationId: string, messageId: string) => {
      set((state) => {
        state.streaming = {
          isStreaming: true,
          conversationId,
          messageId,
          content: "",
          toolCalls: [],
        };
      });
    },

    stopStreaming: () => {
      set((state) => {
        state.streaming = {
          isStreaming: false,
          content: "",
          toolCalls: [],
        };
      });
    },

    setSelectedModel: (model: string) => set((state) => { state.selectedModel = model; }),
    setSearchQuery: (query: string) => set((state) => { state.searchQuery = query; }),

    addOptimisticMessage: (message: Message) => {
      set((state) => { state.messages.push(message); });
    },

    updateMessage: (messageId: string, updates: Partial<Message>) => {
      set((state) => {
        const idx = state.messages.findIndex((m: Message) => m.id ===messageId);
        if (idx !== -1) {
          Object.assign(state.messages[idx], updates);
        }
      });
    },
  }))
);
