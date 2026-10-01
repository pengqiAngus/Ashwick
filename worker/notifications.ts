import "dotenv/config";

import { Pool } from "pg";
import { processNotificationDeliveries, runNotificationCycle, updateWorkerHeartbeat } from "@worker/notifications/engine";

const LOCK_NAME = "ashwick-price-alert-worker";
const INTERVAL_MS = 10_000;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("缺少环境变量 DATABASE_URL");
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [LOCK_NAME]);
  if (!lock.rows[0]?.locked) {
    console.log("[notifications] 已有 Worker 持有锁，当前进程退出");
    client.release();
    await pool.end();
    return;
  }

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    console.log("[notifications] 正在停止 Worker");
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_NAME]);
    } finally {
      client.release();
      await pool.end();
    }
  };
  process.once("SIGTERM", () => void stop());
  process.once("SIGINT", () => void stop());

  const cycle = async () => {
    if (stopped) return;
    try {
      const result = await runNotificationCycle();
      const delivered = await processNotificationDeliveries();
      console.log(`[notifications] 检查 ${result.checked} 个收藏，触发 ${result.triggered} 次，处理 ${delivered} 个通知任务`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[notifications] 检查失败:", message);
      await updateWorkerHeartbeat({ error: message.slice(0, 1000) }).catch((heartbeatError) => {
        console.error("[notifications] 心跳写入失败:", heartbeatError);
      });
    }
  };

  await cycle();
  while (!stopped) {
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
    await cycle();
  }
}

main().catch((error) => {
  console.error("[notifications] Worker 启动失败:", error);
  process.exitCode = 1;
});
