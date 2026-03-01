import { db } from "../db";
import { logger } from "../logger";

const log = logger.child({ service: "persist-messages" });

export async function persistMessages(
  sessionId: string,
  messages: unknown[],
): Promise<void> {
  for (const msg of messages) {
    const m = msg as Record<string, unknown>;
    await db
      .insertInto("session_messages")
      .values({
        session_id: sessionId,
        sdk_message_id: (m.id as string) ?? null,
        type: (m.type as string) ?? "unknown",
        subtype: (m.subtype as string) ?? null,
        parent_tool_use_id: (m.parent_tool_use_id as string) ?? null,
        content: JSON.stringify(m),
      })
      .execute();
  }
}
