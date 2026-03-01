import React from "react";
import { ChatProvider } from "../context/ChatContext.tsx";
import { MessageList } from "./MessageList.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { SessionSidebar } from "./SessionSidebar.tsx";

function ChatInner() {
  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <SessionSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <MessageList />
        <ChatInput />
      </div>
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
