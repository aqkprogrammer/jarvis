"use client";

import { useEffect, useCallback, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { getWebSocketManager, STREAMING_MESSAGE_ID } from "@/lib/websocket";
import { isDemoMode } from "@/lib/api";
import { Message, MessageChunkEvent } from "@/types";

export function useChat(conversationId?: string) {
  const wsManager = getWebSocketManager();
  const mountedRef = useRef(true);

  const {
    messages,
    conversations,
    currentConversation,
    streaming,
    isLoadingMessages,
    isSending,
    selectedModel,
    loadConversations,
    loadConversation,
    createConversation,
    deleteConversation,
    sendMessage,
    deleteMessage,
    appendStreamChunk,
    completeStreaming,
    startStreaming,
    stopStreaming,
    setSelectedModel,
    updateMessage,
  } = useChatStore();

  const { accessToken } = useAuthStore();
  const { addNotification } = useUIStore();

  // Setup WebSocket connection — per-conversation, live mode only
  // (demo mode has no backend; mockApi simulates the assistant reply).
  useEffect(() => {
    if (!accessToken || !conversationId || isDemoMode()) return;

    wsManager.connect(accessToken, conversationId);

    const unsubChunk = wsManager.on("message.chunk", (data) => {
      const event = data as MessageChunkEvent;
      if (!mountedRef.current) return;
      appendStreamChunk(event.message_id, event.chunk);
    });

    const unsubComplete = wsManager.on("message.complete", (data) => {
      // Backend "done" frame: {conversation_id, message_id, model, provider}.
      const done = data as {
        conversation_id: number;
        message_id: number;
        model?: string;
        provider?: string;
      };
      if (!mountedRef.current) return;
      const streamed = useChatStore.getState().streaming.content;
      const finalMessage: Message = {
        id: String(done.message_id),
        conversation_id: String(done.conversation_id),
        role: "assistant",
        content: streamed,
        status: "complete",
        created_at: new Date().toISOString(),
        meta: { model: done.model, provider: done.provider },
      };
      completeStreaming(STREAMING_MESSAGE_ID, finalMessage);
    });

    const unsubError = wsManager.on("message.error", (data) => {
      const event = data as { message_id: string; error: string };
      if (!mountedRef.current) return;
      stopStreaming();
      updateMessage(event.message_id, { status: "error" });
      addNotification("error", "Message Error", event.error);
    });

    return () => {
      unsubChunk();
      unsubComplete();
      unsubError();
    };
  }, [accessToken, conversationId]);

  // Load conversation when ID changes
  useEffect(() => {
    if (conversationId && conversationId !== currentConversation?.id) {
      loadConversation(conversationId).catch(console.error);
    }
  }, [conversationId]);

  // Load conversations list on mount
  useEffect(() => {
    loadConversations().catch(console.error);
    return () => { mountedRef.current = false; };
  }, []);

  const handleSendMessage = useCallback(
    async (content: string, documents?: Array<{ id: string; filename: string }>) => {
      if (!content.trim() || isSending || streaming.isStreaming) return;

      let convId = currentConversation?.id;
      if (!convId) {
        const conv = await createConversation();
        convId = conv.id;
      }

      try {
        await sendMessage(content, documents);
      } catch (error) {
        addNotification("error", "Send Failed", (error as Error).message);
      }
    },
    [currentConversation, isSending, streaming.isStreaming]
  );

  const handleNewConversation = useCallback(async () => {
    try {
      return await createConversation();
    } catch (error) {
      addNotification("error", "Failed to create conversation", (error as Error).message);
    }
  }, []);

  return {
    messages,
    conversations,
    currentConversation,
    streaming,
    isLoadingMessages,
    isSending,
    selectedModel,
    isConnected: wsManager.isConnected,
    handleSendMessage,
    handleNewConversation,
    loadConversation,
    deleteConversation,
    deleteMessage,
    setSelectedModel,
  };
}
