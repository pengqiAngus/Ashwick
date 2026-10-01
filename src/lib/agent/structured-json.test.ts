import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractJsonObject, isResponseFormatUnsupported, parseStructured, resolveStructuredMode, schemaInstruction } from "@/lib/agent/structured-json";

const schema = z.object({ label: z.enum(["a", "b"]), items: z.array(z.string()).default([]), note: z.string().nullable() });

describe("extractJsonObject", () => {
  it("解析纯 JSON、代码块与夹杂说明文字的输出", () => {
    expect(extractJsonObject('{"x":1}')).toEqual({ x: 1 });
    expect(extractJsonObject('好的：\n```json\n{"x":2}\n```\n以上')).toEqual({ x: 2 });
    expect(extractJsonObject('结果如下 {"x":{"y":"含 } 括号的字符串 \\" 转义"}} 结束')).toEqual({ x: { y: '含 } 括号的字符串 " 转义' } });
  });
  it("没有完整对象时抛错", () => {
    expect(() => extractJsonObject("没有 JSON")).toThrow();
    expect(() => extractJsonObject('{"x":')).toThrow();
  });
});

describe("parseStructured", () => {
  it("校验通过并应用默认值", () => {
    const r = parseStructured(schema, '{"label":"a","note":null}');
    expect(r).toEqual({ ok: true, value: { label: "a", items: [], note: null } });
  });
  it("字段不合法返回可回传给模型的错误", () => {
    const r = parseStructured(schema, '{"label":"c","note":null}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("label");
  });
});

describe("mode 与错误识别", () => {
  it("resolveStructuredMode 兼容旧变量", () => {
    expect(resolveStructuredMode({})).toBe("json_schema");
    expect(resolveStructuredMode({ mode: "PROMPT" })).toBe("prompt");
    expect(resolveStructuredMode({ mode: "json_object" })).toBe("json_object");
    expect(resolveStructuredMode({ legacySupports: "false" })).toBe("prompt");
    expect(resolveStructuredMode({ mode: "bogus", legacySupports: "true" })).toBe("json_schema");
  });
  it("识别网关不支持 response_format 的错误", () => {
    expect(isResponseFormatUnsupported(new Error("This response_format type is unavailable now"))).toBe(true);
    const e = Object.assign(new Error("Bad Request"), { responseBody: '{"error":{"message":"response_format json_schema is not supported"}}' });
    expect(isResponseFormatUnsupported(e)).toBe(true);
    expect(isResponseFormatUnsupported(new Error("rate limited"))).toBe(false);
  });
  it("schemaInstruction 包含 JSON Schema", () => {
    const s = schemaInstruction(schema, "demo");
    expect(s).toContain('"label"');
    expect(s).toContain("只输出一个 JSON 对象");
  });
});
