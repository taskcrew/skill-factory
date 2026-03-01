import React, { useEffect, useRef } from "react";
import { useChatContext } from "../context/ChatContext.tsx";
import { MessageBubble } from "./MessageBubble.tsx";

export function MessageList() {
  const { state } = useChatContext();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages, state.messages[state.messages.length - 1]?.text, state.messages[state.messages.length - 1]?.contentBlocks.length]);

  if (state.messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-semibold text-base-content">Start a conversation</p>
            <p className="text-sm text-base-content/50">
              Describe a task and the agent will handle it
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
      {state.messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {state.isAgentRunning &&
        state.messages[state.messages.length - 1]?.role === "user" && (
          <div className="chat chat-start">
            <div className="chat-image avatar placeholder">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/20 text-primary">
                <span className="text-xs font-bold">AI</span>
              </div>
            </div>
            <div className="chat-bubble bg-base-300 text-base-content">
              <span className="loading loading-dots loading-sm" />
            </div>
          </div>
        )}
      <div ref={bottomRef} />
    </div>
  );
}
