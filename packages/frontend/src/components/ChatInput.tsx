import React, { useState, useRef, useEffect } from "react";
import { useChatContext } from "../context/ChatContext.tsx";
import { useSocket } from "../hooks/useSocket.ts";

export function ChatInput() {
  const [text, setText] = useState("");
  const { state } = useChatContext();
  const { sendMessage } = useSocket();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!state.isAgentRunning) {
      inputRef.current?.focus();
    }
  }, [state.isAgentRunning]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || state.isAgentRunning) return;
    sendMessage(trimmed);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-6 py-5 bg-base-200/50 border-t border-base-content/5">
      {state.error && (
        <div className="alert alert-error mb-3 text-sm py-2">
          {state.error}
        </div>
      )}
      <div className="flex gap-2 max-w-4xl mx-auto">
        <input
          ref={inputRef}
          type="text"
          className="input input-bordered flex-1 bg-base-100 px-4 focus:outline-none focus:border-primary"
          placeholder={
            state.isAgentRunning
              ? "Agent is working..."
              : "Describe a task for the agent..."
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={state.isAgentRunning}
        />
        <button
          className="btn btn-primary"
          onClick={handleSend}
          disabled={!text.trim() || state.isAgentRunning}
        >
          {state.isAgentRunning ? (
            <span className="loading loading-spinner loading-sm" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
