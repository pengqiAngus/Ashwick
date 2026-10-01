import { BellRingIcon, CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { getNotificationStatus } from "@worker/notifications/status";

export async function NotificationStatus() {
  const status = await getNotificationStatus();
  const workerOnline = status.worker?.lastSeenAt != null && Date.now() - new Date(status.worker.lastSeenAt).getTime() < 60_000;
  const channelsReady = status.channels.length > 0;
  const tone = channelsReady && workerOnline ? "success" : "warning";
  const missing = [...new Set([...status.sms.missing, ...status.email.missing])].slice(0, 3);

  return (
    <section className="rounded-xl border border-border bg-card/70 p-4 shadow-(--shadow-panel)" aria-label="价格通知状态">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex size-8 items-center justify-center rounded-full ${tone === "success" ? "bg-hit/15 text-hit" : "bg-destructive/15 text-destructive"}`}>
            {tone === "success" ? <CheckCircle2Icon className="size-4" aria-hidden /> : <CircleAlertIcon className="size-4" aria-hidden />}
          </span>
          <div>
            <h2 className="text-sm font-semibold">价格通知</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {channelsReady ? `已启用：${status.channels.join("、")}` : "尚未启用任何通知渠道"}
              {workerOnline ? " · Worker 在线" : " · Worker 尚未在线"}
            </p>
          </div>
        </div>
        <BellRingIcon className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <span>短信：{status.sms.enabled ? status.sms.recipient : "未配置"}</span>
        <span>邮件：{status.email.enabled ? status.email.recipient : "未配置"}</span>
        <span>失败任务：{status.failedCount}</span>
      </div>
      {!channelsReady && missing.length > 0 && (
        <p className="mt-2 text-xs text-destructive">请在 Railway Variables 配置：{missing.join("、")}</p>
      )}
      {status.worker?.lastSeenAt && <p className="mt-2 text-xs text-muted-foreground">最近心跳：{formatDateTime(status.worker.lastSeenAt)}</p>}
    </section>
  );
}
