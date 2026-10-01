import { okJson } from "@/lib/api-error";
import { getNotificationStatus } from "@worker/notifications/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return okJson(await getNotificationStatus());
}
