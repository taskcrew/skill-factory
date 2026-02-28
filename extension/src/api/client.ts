import type {
  RecordedEvent,
  RecordingMetadata,
  RecordingSession,
} from "@shared/types";

export interface RecordingPayload {
  sessionId: string;
  name: string;
  startTime: number;
  endTime?: number;
  metadata: RecordingMetadata;
  events: RecordedEvent[];
  eventCount: number;
}

export interface UploadOptions {
  includeScreenshots?: boolean;
  includeSnapshots?: boolean;
}

export interface UploadResponse {
  success: boolean;
  recordingId?: string;
  error?: string;
}

const DEFAULT_OPTIONS: UploadOptions = {
  includeScreenshots: true,
  includeSnapshots: true,
};

export async function uploadRecording(
  endpoint: string,
  session: RecordingSession,
  apiKey?: string,
  options: UploadOptions = DEFAULT_OPTIONS
): Promise<UploadResponse> {
  const payload = preparePayload(session, options);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Upload failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
}

function preparePayload(
  session: RecordingSession,
  options: UploadOptions
): RecordingPayload {
  let events = [...session.events];

  if (!options.includeScreenshots) {
    events = events.filter((e) => e.type !== "screenshot");
  }

  if (!options.includeSnapshots) {
    events = events.filter((e) => e.type !== "domSnapshot");
  }

  return {
    sessionId: session.id,
    name: session.name,
    startTime: session.startTime,
    endTime: session.endTime,
    metadata: session.metadata,
    events,
    eventCount: events.length,
  };
}

// Mock endpoint for development/testing
export const MOCK_ENDPOINT = "https://api.example.com/recordings";
