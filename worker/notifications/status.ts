import "server-only";

import { getDb } from "@/lib/db";
import { getNotificationConfig, notificationConfigStatus } from "@worker/notifications/config";

export async function getNotificationStatus() {
  const config = getNotificationConfig();
  const base = notificationConfigStatus(config);
  try {
    const [heartbeat, failedCount] = await Promise.all([
      getDb().notificationWorkerHeartbeat.findUnique({ where: { id: "default" } }),
      getDb().notificationDelivery.count({ where: { status: "failed" } }),
    ]);
    return {
      ...base,
      worker: heartbeat
        ? {
            lastSeenAt: heartbeat.lastSeenAt.toISOString(),
            lastCheckAt: heartbeat.lastCheckAt?.toISOString() ?? null,
            lastSuccessAt: heartbeat.lastSuccessAt?.toISOString() ?? null,
            lastError: heartbeat.lastError,
          }
        : null,
      failedCount,
    };
  } catch {
    return { ...base, worker: null, failedCount: 0, databaseUnavailable: true };
  }
}
