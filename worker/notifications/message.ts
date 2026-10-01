import { formatDateTime, formatPrice } from "@/lib/format";

export interface PriceAlertMessage {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  price: string;
  low: string;
  high: string;
  triggeredAt: Date;
  appUrl: string;
}

export function buildAlertMessage(input: PriceAlertMessage) {
  const time = formatDateTime(input.triggeredAt.toISOString());
  const price = formatPrice(input.price, 8);
  const low = formatPrice(input.low, 8);
  const high = formatPrice(input.high, 8);
  const text = `${input.symbol} 价格已进入目标区间：${price} USDT（${low}–${high}），触发时间 ${time}。${input.appUrl}/favorites`;
  return {
    subject: `Ashwick 价格提醒：${input.symbol}`,
    text,
    smsParams: [input.symbol, price, `${low}-${high}`, time],
  };
}
