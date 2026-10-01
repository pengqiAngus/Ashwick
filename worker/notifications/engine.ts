import { getDb } from "@/lib/db";
import { getTickers } from "@/lib/binance/tickers";
import { toPlainString } from "@/lib/decimal";
import { serverEnv } from "@/lib/env";
import { getNotificationConfig } from "@worker/notifications/config";
import { buildAlertMessage } from "@worker/notifications/message";
import { sendEmail, sendSms } from "@worker/notifications/providers";
import { alertTransition } from "@worker/notifications/transition";

const MAX_ATTEMPTS = 4;
const STALE_CLAIM_MS = 10 * 60_000;

function rangeKey(low: string, high: string): string {
  return `${toPlainString(low)}:${toPlainString(high)}`;
}

function retryDelayMs(attempt: number): number {
  return [30_000, 120_000, 600_000, 1_800_000][Math.max(0, Math.min(attempt - 1, 3))];
}

export async function updateWorkerHeartbeat(input: { checkAt?: Date; success?: boolean; error?: string | null } = {}) {
  const now = new Date();
  const checkAt = input.checkAt ?? now;
  await getDb().notificationWorkerHeartbeat.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      lastSeenAt: now,
      lastCheckAt: input.checkAt ? checkAt : null,
      lastSuccessAt: input.success ? now : null,
      lastError: input.error ?? null,
    },
    update: {
      lastSeenAt: now,
      ...(input.checkAt ? { lastCheckAt: checkAt } : {}),
      ...(input.success ? { lastSuccessAt: now, lastError: null } : {}),
      ...(input.error ? { lastError: input.error } : {}),
    },
  });
}

/** 检查一次所有收藏；行情无效时保留上一次边沿状态，不产生误触发。 */
export async function runNotificationCycle(now = new Date()): Promise<{ checked: number; triggered: number }> {
  const db = getDb();
  const favorites = await db.favorite.findMany({
    where: { targetLow: { not: null }, targetHigh: { not: null } },
    select: { id: true, symbol: true, targetLow: true, targetHigh: true, baseAsset: true, quoteAsset: true },
  });
  if (favorites.length === 0) {
    await updateWorkerHeartbeat({ checkAt: now, success: true });
    return { checked: 0, triggered: 0 };
  }

  const { tickers } = await getTickers(favorites.map((favorite) => favorite.symbol));
  const tickerBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
  let triggered = 0;

  for (const favorite of favorites) {
    const ticker = tickerBySymbol.get(favorite.symbol);
    if (!ticker || now.getTime() - ticker.fetchedAt > serverEnv.alertQuoteStaleMs) continue;
    const low = toPlainString(favorite.targetLow!.toFixed());
    const high = toPlainString(favorite.targetHigh!.toFixed());
    const key = rangeKey(low, high);

    const didTrigger = await db.$transaction(async (tx) => {
      const previous = await tx.favoriteAlertState.findUnique({ where: { favoriteId: favorite.id } });
      const transition = alertTransition({
        previousRangeKey: previous?.rangeKey ?? null,
        previousInRange: previous?.inRange ?? false,
        rangeKey: key,
        low,
        high,
        price: ticker.lastPrice,
      });
      const { inside, entered } = transition;
      await tx.favoriteAlertState.upsert({
        where: { favoriteId: favorite.id },
        create: {
          favoriteId: favorite.id,
          rangeKey: key,
          inRange: inside,
          lastPrice: ticker.lastPrice,
          lastCheckedAt: now,
          lastEnteredAt: entered ? now : null,
        },
        update: {
          rangeKey: key,
          inRange: inside,
          lastPrice: ticker.lastPrice,
          lastCheckedAt: now,
          ...(entered ? { lastEnteredAt: now } : {}),
        },
      });
      if (!entered) return false;
      const trigger = await tx.priceAlertTrigger.create({
        data: { favoriteId: favorite.id, rangeKey: key, targetLow: low, targetHigh: high, price: ticker.lastPrice, triggeredAt: now },
      });
      const channels = getNotificationConfig().channels;
      if (channels.length > 0) {
        await tx.notificationDelivery.createMany({
          data: channels.map((channel) => ({ triggerId: trigger.id, channel, status: "pending" as const, nextAttemptAt: now })),
          skipDuplicates: true,
        });
      }
      return true;
    });
    if (didTrigger) triggered += 1;
  }

  await updateWorkerHeartbeat({ checkAt: now, success: true });
  return { checked: favorites.length, triggered };
}

async function sendDelivery(delivery: {
  channel: "sms" | "email";
  trigger: { favorite: { symbol: string; baseAsset: string; quoteAsset: string }; price: unknown; targetLow: unknown; targetHigh: unknown; triggeredAt: Date };
}) {
  const config = getNotificationConfig();
  const message = buildAlertMessage({
    symbol: delivery.trigger.favorite.symbol,
    baseAsset: delivery.trigger.favorite.baseAsset,
    quoteAsset: delivery.trigger.favorite.quoteAsset,
    price: String(delivery.trigger.price),
    low: String(delivery.trigger.targetLow),
    high: String(delivery.trigger.targetHigh),
    triggeredAt: delivery.trigger.triggeredAt,
    appUrl: config.appUrl,
  });
  if (delivery.channel === "sms") {
    if (!config.sms) throw new Error("短信渠道未配置或配置不完整");
    return sendSms(config.sms, message.smsParams);
  }
  if (!config.email) throw new Error("邮件渠道未配置或配置不完整");
  return sendEmail(config.email, message.subject, message.text);
}

/** 领取并发送一批队列任务；渠道之间相互独立。 */
export async function processNotificationDeliveries(now = new Date()): Promise<number> {
  const db = getDb();
  await db.notificationDelivery.updateMany({
    where: { status: "sending", claimedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
    data: { status: "pending", claimedAt: null },
  });

  let processed = 0;
  for (let i = 0; i < 50; i += 1) {
    const candidate = await db.notificationDelivery.findFirst({
      where: { status: { in: ["pending", "failed"] }, attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: now } },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true },
    });
    if (!candidate) break;
    const claimed = await db.notificationDelivery.updateMany({
      where: { id: candidate.id, status: candidate.status, attempts: { lt: MAX_ATTEMPTS } },
      data: { status: "sending", claimedAt: now, attempts: { increment: 1 }, lastError: null },
    });
    if (claimed.count !== 1) continue;
    const delivery = await db.notificationDelivery.findUnique({
      where: { id: candidate.id },
      include: { trigger: { include: { favorite: { select: { symbol: true, baseAsset: true, quoteAsset: true } } } } },
    });
    if (!delivery) continue;
    try {
      const result = await sendDelivery({ channel: delivery.channel, trigger: delivery.trigger });
      await db.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: "sent", sentAt: new Date(), claimedAt: null, providerMessageId: result.providerMessageId ?? null, lastError: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const permanent = delivery.attempts >= MAX_ATTEMPTS;
      await db.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "failed",
          claimedAt: null,
          lastError: message.slice(0, 1000),
          nextAttemptAt: new Date(now.getTime() + (permanent ? 365 * 24 * 60 * 60_000 : retryDelayMs(delivery.attempts))),
        },
      });
      console.error(`[notifications] ${delivery.channel} 发送失败:`, message);
    }
    processed += 1;
  }
  return processed;
}
