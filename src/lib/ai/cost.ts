// Cost of an AI call in USD (E-2, A-6). Prices are USD per 1M tokens and come from the environment,
// because they change; the fallback is deliberately high so the spending cap errs on the safe side.
export type Prices = { inPerM: number; outPerM: number; isFallback: boolean };

export const FALLBACK_PRICES: Prices = { inPerM: 5, outPerM: 15, isFallback: true };

export function getPrices(env: Record<string, string | undefined> = process.env): Prices {
  const inPerM = Number(env.OPENAI_PRICE_IN_PER_M);
  const outPerM = Number(env.OPENAI_PRICE_OUT_PER_M);
  if (env.OPENAI_PRICE_IN_PER_M && env.OPENAI_PRICE_OUT_PER_M && inPerM >= 0 && outPerM >= 0) {
    return { inPerM, outPerM, isFallback: false };
  }
  return FALLBACK_PRICES;
}

export function computeCostUsd(
  usage: { inputTokens?: number; outputTokens?: number },
  prices: Prices = getPrices(),
): number {
  const cost =
    ((usage.inputTokens ?? 0) * prices.inPerM + (usage.outputTokens ?? 0) * prices.outPerM) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

export const DEFAULT_MONTHLY_CAP_USD = 20;
