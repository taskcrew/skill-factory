import React from "react";
import { ChatProvider } from "../context/ChatContext.tsx";
import { MessageList } from "./MessageList.tsx";
import { ChatInput } from "./ChatInput.tsx";

function ChatInner() {
  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      <MessageList />
      <ChatInput />
    </div>
  );
}

export function ChatPage() {
  const sessionId = `session-${Date.now()}`;
  return (
    <ChatProvider sessionId={sessionId}>
      <ChatInner />
    </ChatProvider>
  );
}
