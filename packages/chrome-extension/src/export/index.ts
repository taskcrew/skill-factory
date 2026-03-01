import type { RecordingSession } from "@shared/types";

import {
  convertToAgentBrowser,
  generateAgentBrowserScript,
} from "./agent-browser";

export type ExportFormat = "agent-browser";

export interface ExportResult {
  format: ExportFormat;
  content: string;
  mimeType: string;
  filename: string;
}

export async function exportRecording(
  session: RecordingSession,
  format: ExportFormat
): Promise<ExportResult> {
  switch (format) {
    case "agent-browser":
      return exportAgentBrowser(session);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

function exportAgentBrowser(session: RecordingSession): ExportResult {
  const script = convertToAgentBrowser(session);
  const content = generateAgentBrowserScript(script);
  return {
    format: "agent-browser",
    content,
    mimeType: "text/x-shellscript",
    filename: `${sanitizeFilename(session.name)}.sh`,
  };
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9_-]/gi, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
}
