import { describe, expect, it } from "vitest";
import { applyIntent, extractHorizon, extractSymbols, ruleIntent } from "@/lib/agent/intents";

const ctx = { currentSymbol: "BTCUSDT", currentHorizon: "24h" as const, hasReport: true };

describe("extract", () => {
  it("提取资产代码并补全 USDT，忽略指标缩写", () => {
    expect(extractSymbols("再分析一下 ETH，RSI 怎么样")).toEqual(["ETHUSDT"]);
    expect(extractSymbols("分析 SOLUSDT 与 BTC")).toEqual(["SOLUSDT", "BTCUSDT"]);
  });
  it("提取预测时长并映射到支持的取值", () => {
    expect(extractHorizon("换成未来 4 小时再分析一次")).toBe("4h");
    expect(extractHorizon("接下来 3 天")).toBe("3d");
    expect(extractHorizon("看看一周走势")).toBe("7d");
    expect(extractHorizon("为什么")).toBeNull();
  });
});

describe("ruleIntent", () => {
  it("解释类追问不重跑", () => {
    const r = ruleIntent("为什么你认为目前是震荡？", ctx);
    expect(r.kind).toBe("followup_explain");
    expect(r.confident).toBe(true);
  });
  it("提到当前交易对不算切换", () => {
    const r = ruleIntent("你提到的 BTC 支撑位是怎么算出来的？", ctx);
    expect(r.kind).toBe("followup_explain");
  });
  it("假设情景", () => {
    const r = ruleIntent("如果跌破这个位置，结论会怎样变化？", ctx);
    expect(r.kind).toBe("hypothetical");
    expect(r.hypothesis).toContain("跌破");
  });
  it("刷新数据", () => {
    expect(ruleIntent("刷新一下数据", ctx).kind).toBe("refresh");
  });
  it("改变周期", () => {
    const r = ruleIntent("换成未来 4 小时再分析一次。", ctx);
    expect(r.kind).toBe("change_horizon");
    expect(r.horizon).toBe("4h");
  });
  it("切换交易对", () => {
    const r = ruleIntent("再分析一下 ETH。", ctx);
    expect(r.kind).toBe("switch_symbol");
    expect(r.symbol).toBe("ETHUSDT");
  });
  it("无报告且无资产 → 澄清", () => {
    const r = ruleIntent("帮我分析一下走势", { currentSymbol: null, currentHorizon: null, hasReport: false });
    expect(r.kind).toBe("clarify");
  });
  it("无报告首次分析", () => {
    const r = ruleIntent("分析一下 BTC 接下来 24 小时的走势。", { currentSymbol: null, currentHorizon: null, hasReport: false });
    expect(r.kind).toBe("full_analysis");
    expect(r.symbol).toBe("BTCUSDT");
    expect(r.horizon).toBe("24h");
  });
  it("模糊追问标记为不确定", () => {
    expect(ruleIntent("嗯，然后呢", ctx).confident).toBe(false);
  });
});

describe("applyIntent", () => {
  const base = { symbol: "BTCUSDT", intervals: ["1h", "4h", "1d"] as const, horizon: "24h" as const, targetRange: { low: "1", high: "2" }, question: "q" };
  it("切换交易对清空目标区间与报告引用", () => {
    const c = applyIntent({ ...base, intervals: [...base.intervals] }, { kind: "switch_symbol", symbol: "ETHUSDT", horizon: null, hypothesis: null }, "r1");
    expect(c.symbol).toBe("ETHUSDT");
    expect(c.targetRange).toBeNull();
    expect(c.baseReportId).toBeNull();
  });
  it("解释类引用当前报告", () => {
    const c = applyIntent({ ...base, intervals: [...base.intervals] }, { kind: "followup_explain", symbol: null, horizon: null, hypothesis: null }, "r1");
    expect(c.baseReportId).toBe("r1");
    expect(c.symbol).toBe("BTCUSDT");
  });
});
