/**
 * 持久化层集成测试：需要可用的 PostgreSQL（读取 .env 的 DATABASE_URL）。
 * 没有数据库时整组跳过。
 */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { RunConfig } from "@/lib/agent/schemas";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("persistence (integration)", () => {
  // 动态导入，避免无数据库环境下加载 Prisma 客户端
  type P = typeof import("@/lib/agent/persistence");
  let p: P;
  let getDb: typeof import("@/lib/db").getDb;
  const created: string[] = [];
  const config: RunConfig = { symbol: "BTCUSDT", intervals: ["1h", "4h", "1d"], horizon: "24h", targetRange: null, question: "q" };

  beforeAll(async () => {
    p = await import("@/lib/agent/persistence");
    getDb = (await import("@/lib/db")).getDb;
    await getDb().$queryRaw`SELECT 1`;
  });
  afterAll(async () => {
    if (created.length) await getDb().conversation.deleteMany({ where: { id: { in: created } } });
    await getDb().$disconnect();
  });

  async function launch() {
    const launchId = randomUUID();
    const r = await p.createLaunchConversation({ source: "favorite_card", launchId, text: "分析 BTCUSDT", symbol: "BTCUSDT", intervals: ["1h", "4h", "1d"], horizon: "24h", title: "t" });
    created.push(r.conversationId);
    return { ...r, launchId };
  }

  it("launchId 幂等：重复创建返回同一会话与消息", async () => {
    const a = await launch();
    const b = await p.createLaunchConversation({ source: "favorite_card", launchId: a.launchId, text: "x", symbol: "BTCUSDT", intervals: ["1h"], horizon: "24h", title: "t" });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.conversationId).toBe(a.conversationId);
    expect(b.messageId).toBe(a.messageId);
    const view = await p.getConversationView(a.conversationId);
    expect(view?.pendingMessageId).toBe(a.messageId);
    expect(view?.activeRun).toBeNull();
  });

  it("并发 claim 只成功一次，另一方得到 ClaimConflict；完成后消息不能再被 claim", async () => {
    const a = await launch();
    const results = await Promise.allSettled([
      p.claimRun({ conversationId: a.conversationId, messageId: a.messageId, kind: "full_analysis", config }),
      p.claimRun({ conversationId: a.conversationId, messageId: a.messageId, kind: "full_analysis", config }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect((bad[0] as PromiseRejectedResult).reason.name).toBe("ClaimConflict");
    const claim = (ok[0] as PromiseFulfilledResult<Awaited<ReturnType<P["claimRun"]>>>).value;
    expect(claim.run.attempt).toBe(1);
    expect(claim.assistantMessage.replyToMessageId).toBe(a.messageId);

    const conv = await getDb().conversation.findUnique({ where: { id: a.conversationId } });
    expect(conv?.activeRunId).toBe(claim.run.id);
    const view = await p.getConversationView(a.conversationId);
    expect(view?.pendingMessageId).toBeNull();
    expect(view?.activeRun?.runId).toBe(claim.run.id);

    const info = await p.describeConflict(a.conversationId, a.messageId);
    expect(info.kind).toBe("active_run");

    expect(await p.markRunRunning(claim.run.id, {})).toBe(true);
    expect(await p.markRunRunning(claim.run.id, {})).toBe(false);

    const fin = await p.finalizeRun({ runId: claim.run.id, terminal: "completed", parts: [{ type: "text", text: "done" }], metadata: { runId: claim.run.id, kind: "full_analysis", createdAt: new Date().toISOString(), status: "complete" } });
    expect(fin).toBe("finalized");
    expect(await p.finalizeRun({ runId: claim.run.id, terminal: "failed", parts: null, metadata: null })).toBe("already-terminal");

    const after = await getDb().conversation.findUnique({ where: { id: a.conversationId } });
    expect(after?.activeRunId).toBeNull();
    const msg = await getDb().message.findUnique({ where: { id: a.messageId } });
    expect(msg?.status).toBe("complete");
    await expect(p.claimRun({ conversationId: a.conversationId, messageId: a.messageId, kind: "full_analysis", config })).rejects.toMatchObject({ name: "ClaimConflict", reason: "message" });
  });

  it("失败后可重试：新运行 attempt+1，旧运行保留，assistant 消息复用", async () => {
    const a = await launch();
    const c1 = await p.claimRun({ conversationId: a.conversationId, messageId: a.messageId, kind: "full_analysis", config });
    await p.finalizeRun({ runId: c1.run.id, terminal: "failed", error: { code: "x", message: "boom" }, parts: null, metadata: null });
    const view = await p.getConversationView(a.conversationId);
    expect(view?.retryableMessageId).toBe(a.messageId);
    const c2 = await p.claimRun({ conversationId: a.conversationId, messageId: a.messageId, kind: "full_analysis", config });
    expect(c2.run.attempt).toBe(2);
    expect(c2.assistantMessage.id).toBe(c1.assistantMessage.id);
    const old = await getDb().analysisRun.findUnique({ where: { id: c1.run.id } });
    expect(old?.status).toBe("failed");
    await p.finalizeRun({ runId: c2.run.id, terminal: "cancelled", parts: null, metadata: null });
  });

  it("取消：running → cancelling；心跳读回 cancelling；finalize cancelled", async () => {
    const a = await launch();
    const c = await p.claimRun({ conversationId: a.conversationId, messageId: a.messageId, kind: "full_analysis", config });
    await p.markRunRunning(c.run.id, {});
    expect(await p.requestCancel(c.run.id)).toBe("cancelling");
    expect(await p.heartbeat(c.run.id)).toBe("cancelling");
    expect(await p.finalizeRun({ runId: c.run.id, terminal: "cancelled", parts: null, metadata: null })).toBe("finalized");
    expect(await p.requestCancel(c.run.id)).toBe("cancelled");
  });

  it("孤儿回收：心跳过期的活跃运行被标记失败并释放租约", async () => {
    const a = await launch();
    const c = await p.claimRun({ conversationId: a.conversationId, messageId: a.messageId, kind: "full_analysis", config });
    await getDb().analysisRun.update({ where: { id: c.run.id }, data: { heartbeatAt: new Date(Date.now() - 10 * 60_000) } });
    expect(await p.reapOrphanForConversation(a.conversationId)).toBe(true);
    const run = await getDb().analysisRun.findUnique({ where: { id: c.run.id } });
    expect(run?.status).toBe("failed");
    const conv = await getDb().conversation.findUnique({ where: { id: a.conversationId } });
    expect(conv?.activeRunId).toBeNull();
    const view = await p.getConversationView(a.conversationId);
    expect(view?.retryableMessageId).toBe(a.messageId);
  });

  it("模式 B 用户消息按 clientMessageId 去重", async () => {
    const a = await launch();
    const cid = randomUUID();
    const m1 = await p.persistUserMessage(a.conversationId, { id: cid, parts: [{ type: "text", text: "hi" }] });
    const m2 = await p.persistUserMessage(a.conversationId, { id: cid, parts: [{ type: "text", text: "hi" }] });
    expect(m2.id).toBe(m1.id);
    expect(m1.ordinal).toBe(1);
  });
});
