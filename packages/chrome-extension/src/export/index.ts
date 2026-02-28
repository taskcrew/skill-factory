import type { RecordingSession } from "@shared/types";

import { convertToMcp, generateMcpJson } from "./mcp";

export type ExportFormat = "mcp";

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
    case "mcp":
      return exportMcp(session);
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

function exportMcp(session: RecordingSession): ExportResult {
  const workflow = convertToMcp(session);
  const json = generateMcpJson(workflow);
  return {
    format: "mcp",
    content: json,
    mimeType: "application/json",
    filename: `${sanitizeFilename(session.name)}.mcp.json`,
  };
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9_-]/gi, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
}
