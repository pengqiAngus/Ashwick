/** 币安现货公开接口的原始响应形状（仅保留本项目用到的字段） */

export interface BinanceExchangeInfoSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed: boolean;
  filters: Array<{ filterType: string; tickSize?: string; minPrice?: string; maxPrice?: string }>;
}

export interface BinanceExchangeInfo {
  serverTime: number;
  symbols: BinanceExchangeInfoSymbol[];
}

export interface BinanceTicker24hr {
  symbol: string;
  lastPrice: string;
  priceChange: string;
  priceChangePercent: string;
  closeTime: number;
}

/**
 * K 线数组：
 * [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote, ignore]
 */
export type BinanceKlineTuple = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

export interface BinanceErrorBody {
  code: number;
  msg: string;
}
