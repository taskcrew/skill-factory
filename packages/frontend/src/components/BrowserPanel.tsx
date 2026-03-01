import React from "react";

interface BrowserPanelProps {
  liveUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

export function BrowserPanel({ liveUrl, isLoading, error }: BrowserPanelProps) {
  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-base-200">
        <div className="text-center p-6">
          <div className="text-error text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-base-200">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }

  if (!liveUrl) {
    return (
      <div className="flex items-center justify-center h-full bg-base-200">
        <div className="text-center p-6">
          <div className="text-4xl mb-3">🌐</div>
          <p className="text-base-content/60 text-sm">
            Browser session will appear here
          </p>
          <p className="text-base-content/40 text-xs mt-1">
            Start a task to launch a remote browser
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-base-300">
      {/* Browser chrome bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-base-200 border-b border-base-300">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-error/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-warning/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-success/60" />
        </div>
        <div className="flex-1 text-xs text-base-content/50 truncate text-center">
          Remote Browser
        </div>
      </div>

      {/* Browser iframe */}
      <iframe
        src={liveUrl}
        className="flex-1 w-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        allow="clipboard-read; clipboard-write"
        title="Remote browser session"
      />
    </div>
  );
}
