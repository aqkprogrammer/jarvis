"use client";

import { useEffect, useCallback, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { getWebSocketManager } from "@/lib/websocket";
import {
  MessageChunkEvent,
  MessageCompleteEvent,
  WSEvent,
} from "@/types";

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

  // Setup WebSocket connection
  useEffect(() => {
    if (!accessToken) return;

    wsManager.connect(accessToken);

    const unsubChunk = wsManager.on("message.chunk", (data) => {
      const event = data as MessageChunkEvent;
      if (!mountedRef.current) return;
      appendStreamChunk(event.message_id, event.chunk);
    });

    const unsubComplete = wsManager.on("message.complete", (data) => {
      const event = data as MessageCompleteEvent;
      if (!mountedRef.current) return;
      completeStreaming(event.message_id, event.message);
    });

    const unsubError = wsManager.on("message.error", (data) => {
      const event = data as { message_id: string; error: string };
      if (!mountedRef.current) return;
      stopStreaming();
      updateMessage(event.message_id, { status: "error" });
      addNotification("error", "Message Error", event.error);
    });

    const unsubToolStart = wsManager.on("tool.start", (data) => {
      const event = data as { tool_name: string; message_id: string };
      if (!mountedRef.current) return;
      // Tool call started - update UI
    });

    return () => {
      mountedRef.current = false;
      unsubChunk();
      unsubComplete();
      unsubError();
      unsubToolStart();
    };
  }, [accessToken]);

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
