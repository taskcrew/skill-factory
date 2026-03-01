import React from "react";
import type { ChatMessage } from "../types/chat.ts";
import { MarkdownRenderer } from "./MarkdownRenderer.tsx";
import { ToolCallCard } from "./ToolCallCard.tsx";

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  if (message.role === "system") {
    return (
      <div className="text-center text-xs text-base-content/40 my-4">
        {message.text}
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div className={`chat ${isUser ? "chat-end" : "chat-start"}`}>
      <div className="chat-image avatar placeholder">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isUser
              ? "bg-primary text-primary-content"
              : "bg-primary/20 text-primary"
          }`}
        >
          <span className="text-xs font-bold">{isUser ? "U" : "AI"}</span>
        </div>
      </div>
      <div
        className={`chat-bubble ${
          isUser
            ? "chat-bubble-primary"
            : "bg-base-300 text-base-content"
        }`}
      >
        {message.text && <MarkdownRenderer content={message.text} />}
        {message.toolCalls.map((tc) => (
          <ToolCallCard key={tc.id} toolCall={tc} />
        ))}
        {message.isStreaming && !message.text && message.toolCalls.length === 0 && (
          <span className="loading loading-dots loading-sm" />
        )}
      </div>
    </div>
  );
}
