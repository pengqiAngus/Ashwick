import { getDb } from "@/lib/db";
import { toPlainString } from "@/lib/decimal";
import { formatPrice } from "@/lib/format";
export { validateTargetRange } from "@/lib/target-range-validate";
import { getSymbol } from "@/lib/binance/symbols";
import type { FavoriteDto, FavoriteEventDto, PositionSide } from "@/lib/types";
import type { Favorite } from "@/generated/prisma/client";

const SIDE_TEXT: Record<PositionSide, string> = { long: "开多", short: "开空" };

export function describeSideChange(side: PositionSide | null): string {
  return side ? `开仓方向改为${SIDE_TEXT[side]}` : "清除开仓方向";
}

export function describeTargetChange(low: string | null, high: string | null): string {
  if (low == null || high == null) return "移除目标区间";
  return `目标区间设为 ${formatPrice(low)} – ${formatPrice(high)}`;
}

export function describeNoteChange(note: string | null): string {
  return note ? "保存备注" : "清空备注";
}

export class FavoriteError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "FavoriteError";
    this.status = status;
  }
}

function toDto(row: Favorite): FavoriteDto {
  return {
    symbol: row.symbol,
    baseAsset: row.baseAsset,
    quoteAsset: row.quoteAsset,
    side: row.side,
    targetLow: row.targetLow == null ? null : toPlainString(row.targetLow.toFixed()),
    targetHigh: row.targetHigh == null ? null : toPlainString(row.targetHigh.toFixed()),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listFavorites(): Promise<FavoriteDto[]> {
  const rows = await getDb().favorite.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(toDto);
}

export async function getFavorite(symbol: string): Promise<FavoriteDto | null> {
  const row = await getDb().favorite.findUnique({ where: { symbol } });
  return row ? toDto(row) : null;
}

/** 新增收藏。仅允许当前可交易的 USDT 现货交易对；重复收藏幂等 */
export async function addFavorite(symbol: string): Promise<FavoriteDto> {
  const info = await getSymbol(symbol);
  if (!info) throw new FavoriteError(404, `不支持的交易对：${symbol}`);
  const row = await getDb().favorite.upsert({
    where: { symbol: info.symbol },
    create: { symbol: info.symbol, baseAsset: info.baseAsset, quoteAsset: info.quoteAsset },
    update: {},
  });
  return toDto(row);
}

export async function removeFavorite(symbol: string): Promise<boolean> {
  const result = await getDb().favorite.deleteMany({ where: { symbol } });
  return result.count > 0;
}

type FavoritePatch = {
  side?: PositionSide | null;
  note?: string | null;
  targetLow?: string | null;
  targetHigh?: string | null;
};

/** 更新收藏并记一条操作。未收藏时返回 null。 */
async function commitFavorite(symbol: string, summary: string, data: FavoritePatch): Promise<FavoriteDto | null> {
  const db = getDb();
  const existing = await db.favorite.findUnique({ where: { symbol }, select: { id: true } });
  if (!existing) return null;
  const row = await db.$transaction(async (tx) => {
    const updated = await tx.favorite.update({ where: { symbol }, data });
    await tx.favoriteEvent.create({ data: { favoriteId: existing.id, summary } });
    return updated;
  });
  return toDto(row);
}

/** 保存开仓方向；传 null 表示清除。交易对未收藏时返回 null */
export async function setPositionSide(symbol: string, side: PositionSide | null): Promise<FavoriteDto | null> {
  return commitFavorite(symbol, describeSideChange(side), { side });
}

/** 保存备注；空白视为清空。交易对未收藏时返回 null */
export async function setNote(symbol: string, note: string | null): Promise<FavoriteDto | null> {
  return commitFavorite(symbol, describeNoteChange(note), { note });
}

/** 保存目标区间；交易对未收藏时返回 null */
export async function setTargetRange(
  symbol: string,
  low: string | null,
  high: string | null,
): Promise<FavoriteDto | null> {
  return commitFavorite(symbol, describeTargetChange(low, high), { targetLow: low, targetHigh: high });
}

/** 该收藏的操作记录，新的在前。未收藏时返回 null。收藏本身用 Favorite.createdAt 表示。 */
export async function listFavoriteEvents(symbol: string): Promise<FavoriteEventDto[] | null> {
  const db = getDb();
  const existing = await db.favorite.findUnique({ where: { symbol }, select: { id: true } });
  if (!existing) return null;
  // ponytail: 只展示最近 100 条，要更早的记录再分页
  const rows = await db.favoriteEvent.findMany({
    where: { favoriteId: existing.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) => ({ id: row.id, summary: row.summary, createdAt: row.createdAt.toISOString() }));
}
