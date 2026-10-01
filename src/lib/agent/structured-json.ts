/**
 * 不依赖 response_format 的结构化输出：把 JSON Schema 写进提示词，
 * 再从模型文本中提取 JSON 并用 zod 校验。纯函数，便于测试。
 */
import { z } from "zod";

export type StructuredMode = "json_schema" | "json_object" | "prompt";

/** 生成给模型看的输出格式说明 */
export function schemaInstruction(schema: z.ZodType, name: string): string {
  let json: unknown;
  try {
    json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  } catch {
    json = { type: "object" };
  }
  return [
    `输出格式要求（${name}）：`,
    "只输出一个 JSON 对象，不要输出任何解释、前后缀文字或 Markdown 代码块标记。",
    "JSON 必须符合以下 JSON Schema；字段名保持英文，字段内容使用中文；没有依据的可空字段填 null，数组可以为空。",
    "保持精简：每个数组最多 5 条，每条文字不超过 80 字；evidenceIds 只列出最关键的证据 id；不要在字符串里重复罗列大量数值。",
    JSON.stringify(json),
  ].join("\n");
}

/**
 * 从模型输出中提取第一个完整的 JSON 对象：
 * - 兼容 ```json 代码块
 * - 兼容前后夹杂说明文字
 * - 按括号配对扫描，正确跳过字符串中的括号与转义
 */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], trimmed].filter((x): x is string => Boolean(x));
  for (const src of candidates) {
    const start = src.indexOf("{");
    if (start < 0) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          return JSON.parse(src.slice(start, i + 1));
        }
      }
    }
  }
  throw new Error("模型输出中没有找到完整的 JSON 对象");
}

/** 提取并校验；失败时返回可回传给模型的错误说明 */
export function parseStructured<S extends z.ZodType>(schema: S, text: string): { ok: true; value: z.infer<S> } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = extractJsonObject(text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "JSON 解析失败" };
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    const issues = r.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("；");
    return { ok: false, error: `字段校验失败：${issues}` };
  }
  return { ok: true, value: r.data };
}

/** 读取结构化输出模式。兼容旧变量 AI_SUPPORTS_STRUCTURED_OUTPUTS */
export function resolveStructuredMode(env: { mode?: string; legacySupports?: string }): StructuredMode {
  const m = env.mode?.trim().toLowerCase();
  if (m === "json_schema" || m === "json_object" || m === "prompt") return m;
  if (env.legacySupports != null && env.legacySupports.toLowerCase() === "false") return "prompt";
  return "json_schema";
}

/** 判断错误是否为“服务不支持该 response_format”，用于自动降级 */
export function isResponseFormatUnsupported(err: unknown): boolean {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      const body = (cur as { responseBody?: unknown }).responseBody;
      if (typeof body === "string") parts.push(body);
      cur = (cur as { cause?: unknown }).cause;
    } else break;
  }
  const s = parts.join(" ").toLowerCase();
  return /response_format|json_schema|json_object|structured output/.test(s) && /unavailable|unsupported|not support|invalid|not allowed/.test(s);
}
