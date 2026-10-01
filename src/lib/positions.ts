import { getSymbol } from "@/lib/binance/symbols";
import { getDb } from "@/lib/db";
import { Decimal, parsePositiveDecimal, toPlainString } from "@/lib/decimal";
import { isLeverage, LEVERAGE_MAX, LEVERAGE_MIN, marginFromEntry, settleClose, type CloseUnit } from "@/lib/position-math";
import type { PositionCloseDto, PositionDto, PositionSide } from "@/lib/types";
import type { Position, PositionClose } from "@/generated/prisma/client";

export class PositionError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PositionError";
    this.status = status;
  }
}

function plain(value: { toFixed(): string }): string {
  return toPlainString(value.toFixed());
}

function dec(value: { toFixed(): string }): Decimal {
  return new Decimal(value.toFixed());
}

function requirePositive(raw: string, label: string): Decimal {
  const parsed = parsePositiveDecimal(raw);
  if (parsed.ok) return parsed.value;
  if (parsed.reason === "empty") throw new PositionError(400, `请填写${label}`);
  if (parsed.reason === "nonpositive") throw new PositionError(400, `${label}必须大于 0`);
  throw new PositionError(400, `${label}格式无效`);
}

function toPositionDto(row: Position): PositionDto {
  return {
    id: row.id,
    symbol: row.symbol,
    baseAsset: row.baseAsset,
    quoteAsset: row.quoteAsset,
    side: row.side,
    margin: plain(row.margin),
    leverage: row.leverage,
    entryPrice: plain(row.entryPrice),
    baseQty: plain(row.baseQty),
    status: row.status,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

function toCloseDto(row: PositionClose & { position: Position }): PositionCloseDto {
  return {
    id: row.id,
    positionId: row.positionId,
    symbol: row.position.symbol,
    baseAsset: row.position.baseAsset,
    quoteAsset: row.position.quoteAsset,
    side: row.position.side,
    entryPrice: plain(row.entryPrice),
    closePrice: plain(row.closePrice),
    closedBase: plain(row.closedBase),
    closedMargin: plain(row.closedMargin),
    realizedPnl: plain(row.realizedPnl),
    roi: plain(row.roi),
    createdAt: row.createdAt.toISOString(),
  };
}

/** 按弹窗里选择的方向开一笔仓位。不要求已收藏。 */
export async function openPosition(input: {
  symbol: string;
  side: PositionSide;
  baseQty: string;
  leverage: number;
  entryPrice: string;
}): Promise<PositionDto> {
  if (!isLeverage(input.leverage)) throw new PositionError(400, `杠杆必须是 ${LEVERAGE_MIN} 到 ${LEVERAGE_MAX} 的整数`);
  const baseQty = requirePositive(input.baseQty, "数量");
  const entryPrice = requirePositive(input.entryPrice, "开仓价格");
  const info = await getSymbol(input.symbol);
  if (!info) throw new PositionError(404, `不支持的交易对：${input.symbol}`);

  const margin = marginFromEntry(baseQty, entryPrice, input.leverage);
  const row = await getDb().position.create({
    data: {
      symbol: info.symbol,
      baseAsset: info.baseAsset,
      quoteAsset: info.quoteAsset,
      side: input.side,
      margin: toPlainString(margin),
      leverage: input.leverage,
      entryPrice: toPlainString(entryPrice),
      baseQty: toPlainString(baseQty),
    },
  });
  return toPositionDto(row);
}

export async function listOpenPositions(): Promise<PositionDto[]> {
  const rows = await getDb().position.findMany({ where: { status: "open" }, orderBy: { openedAt: "desc" } });
  return rows.map(toPositionDto);
}

/** 删掉仓位。数据库级联删掉它的平仓记录，记录页统计不会再读到。 */
export async function deletePosition(id: string): Promise<boolean> {
  const result = await getDb().position.deleteMany({ where: { id } });
  return result.count > 0;
}

/** 删掉一条平仓。记录页只读还在的行，所以删除后不再计入盈亏。 */
export async function deletePositionClose(id: string): Promise<boolean> {
  const result = await getDb().positionClose.deleteMany({ where: { id } });
  return result.count > 0;
}

/** 全部平仓记录，新的在前。ponytail: 全表读取，上万条再分页。 */
export async function listPositionCloses(): Promise<PositionCloseDto[]> {
  const rows = await getDb().positionClose.findMany({
    orderBy: { createdAt: "desc" },
    include: { position: true },
  });
  return rows.map(toCloseDto);
}

export async function closePosition(
  id: string,
  input: { amount: string; unit: CloseUnit; closePrice: string },
): Promise<{ position: PositionDto; close: PositionCloseDto }> {
  const amount = requirePositive(input.amount, "平仓数量");
  const closePrice = requirePositive(input.closePrice, "平仓价格");
  const db = getDb();

  const result = await db.$transaction(async (tx) => {
    const row = await tx.position.findUnique({ where: { id } });
    if (!row || row.status !== "open") throw new PositionError(404, "该仓位已平仓或不存在");
    const settled = settleClose({
      side: row.side,
      entryPrice: dec(row.entryPrice),
      margin: dec(row.margin),
      baseQty: dec(row.baseQty),
      amount,
      unit: input.unit,
      closePrice,
    });
    if (!settled.ok) {
      throw new PositionError(400, settled.reason === "exceeds" ? "平仓数量超过剩余持仓" : "平仓数量必须大于 0");
    }

    const updated = await tx.position.update({
      where: { id: row.id },
      data: settled.fullyClosed
        ? { margin: "0", baseQty: "0", status: "closed", closedAt: new Date() }
        : { margin: toPlainString(settled.remainingMargin), baseQty: toPlainString(settled.remainingBase) },
    });
    const close = await tx.positionClose.create({
      data: {
        positionId: row.id,
        entryPrice: plain(row.entryPrice),
        closePrice: toPlainString(closePrice),
        closedBase: toPlainString(settled.closedBase),
        closedMargin: toPlainString(settled.closedMargin),
        realizedPnl: toPlainString(settled.realizedPnl),
        roi: toPlainString(settled.roi),
      },
      include: { position: true },
    });
    return { position: updated, close };
  });

  return { position: toPositionDto(result.position), close: toCloseDto(result.close) };
}
