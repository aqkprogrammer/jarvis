import { Suspense } from 'react';
import { ChatInterface } from "@/components/chat/ChatInterface";

export const metadata = {
  title: "Chat - JARVIS",
};

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-slate-500">Loading...</div></div>}>
      <ChatInterface />
    </Suspense>
  );
}
