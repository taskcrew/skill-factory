import React, { useState } from "react";
import { ChatProvider, useChatContext } from "../context/ChatContext.tsx";
import { MessageList } from "./MessageList.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { SessionSidebar } from "./SessionSidebar.tsx";
import { BrowserPanel } from "./BrowserPanel.tsx";
import { useBrowserPreview } from "../hooks/useBrowserPreview.ts";

function ChatInner() {
  const { state } = useChatContext();
  const { liveUrl, isLoading, error } = useBrowserPreview(state.sessionId);
  const [showBrowser, setShowBrowser] = useState(true);

  const hasBrowser = !!liveUrl;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <SessionSidebar />

      {/* Chat panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <MessageList />
        <ChatInput />
      </div>

      {/* Browser panel */}
      {showBrowser && (
        <div className="w-1/2 border-l border-base-300 relative">
          {/* Toggle button */}
          <button
            onClick={() => setShowBrowser(false)}
            className="btn btn-ghost btn-xs absolute top-2 right-2 z-10"
            title="Hide browser panel"
          >
            ✕
          </button>
          <BrowserPanel liveUrl={liveUrl} isLoading={isLoading} error={error} />
        </div>
      )}

      {/* Show browser button when panel is hidden */}
      {!showBrowser && (
        <button
          onClick={() => setShowBrowser(true)}
          className="btn btn-ghost btn-sm absolute right-4 top-[4.5rem] z-10"
          title="Show browser panel"
        >
          🌐
        </button>
      )}
    </div>
  );
}

export function ChatPage() {
  return (
    <ChatProvider>
      <ChatInner />
    </ChatProvider>
  );
}
