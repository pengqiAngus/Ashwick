import { getDb } from "@/lib/db";
import type { MemoDto } from "@/lib/types";
import type { Memo } from "@/generated/prisma/client";

const MAX_BODY = 2000;

export class MemoError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "MemoError";
    this.status = status;
  }
}

export function normalizeMemoBody(raw: string): string {
  const body = raw.trim();
  if (!body) throw new MemoError(400, "备注不能为空");
  if (body.length > MAX_BODY) throw new MemoError(400, "备注不能超过 2000 字");
  return body;
}

function toDto(row: Memo): MemoDto {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listMemos(): Promise<MemoDto[]> {
  const rows = await getDb().memo.findMany({ orderBy: { updatedAt: "desc" } });
  return rows.map(toDto);
}

export async function createMemo(raw: string): Promise<MemoDto> {
  const row = await getDb().memo.create({ data: { body: normalizeMemoBody(raw) } });
  return toDto(row);
}

export async function updateMemo(id: string, raw: string): Promise<MemoDto | null> {
  const db = getDb();
  const existing = await db.memo.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return null;
  const row = await db.memo.update({ where: { id }, data: { body: normalizeMemoBody(raw) } });
  return toDto(row);
}

export async function deleteMemo(id: string): Promise<boolean> {
  const result = await getDb().memo.deleteMany({ where: { id } });
  return result.count > 0;
}
