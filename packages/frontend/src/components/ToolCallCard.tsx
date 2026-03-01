import React, { useState } from "react";
import type { ToolCall } from "../types/chat.ts";

interface Props {
  toolCall: ToolCall;
}

function formatInput(name: string, input: unknown): string {
  if (!input || typeof input !== "object") return String(input ?? "");
  const obj = input as Record<string, unknown>;

  switch (name) {
    case "Bash":
      return String(obj.command ?? JSON.stringify(input, null, 2));
    case "Read":
      return String(obj.file_path ?? JSON.stringify(input, null, 2));
    case "Write":
    case "Edit":
      return String(obj.file_path ?? JSON.stringify(input, null, 2));
    case "Grep":
      return `${obj.pattern ?? ""}${obj.path ? ` in ${obj.path}` : ""}`;
    case "Glob":
      return String(obj.pattern ?? JSON.stringify(input, null, 2));
    default:
      return JSON.stringify(input, null, 2);
  }
}

function formatResult(result: unknown): string {
  if (result === undefined || result === null) return "";
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running") {
    return <span className="loading loading-spinner loading-xs text-warning" />;
  }
  if (status === "completed") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

export function ToolCallCard({ toolCall }: Props) {
  const [open, setOpen] = useState(toolCall.status === "running");
  const inputStr = formatInput(toolCall.name, toolCall.input);
  const resultStr = formatResult(toolCall.result);

  return (
    <div
      className="my-2 rounded-lg border border-base-content/10 overflow-hidden bg-base-100/50 cursor-pointer"
      onClick={() => setOpen(!open)}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <StatusIcon status={toolCall.status} />
        <span className="font-mono text-xs font-semibold text-primary">
          {toolCall.name}
        </span>
        <span className="text-xs text-base-content/50 truncate flex-1">
          {inputStr}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-3.5 h-3.5 text-base-content/30 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </div>

      {/* Body */}
      {open && (
        <div className="border-t border-base-content/10 px-3 py-2 space-y-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-base-content/30 mb-1">Input</div>
            <pre className="bg-base-100 rounded p-2 text-xs overflow-x-auto max-h-40 whitespace-pre-wrap text-base-content/80">
              {inputStr}
            </pre>
          </div>
          {resultStr && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-base-content/30 mb-1">Output</div>
              <pre className="bg-base-100 rounded p-2 text-xs overflow-x-auto max-h-52 whitespace-pre-wrap text-base-content/80">
                {resultStr}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
