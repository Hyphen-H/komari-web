const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LONG_TERM_DAYS = 36500; // 约 100 年视为长期

const roundAmount = (value: number) => Math.round(value * 100) / 100;

export type BillingValues = {
  used: number;
  remaining: number;
};

/**
 * 按剩余天数占计费周期的比例计算剩余价值，已用价值 = 本期价格 - 剩余价值。
 * - 价格 <= 0 或免费：都为 0
 * - 已过期 / 无到期时间：剩余 0，已用为全额
 * - 长期（>100 年）或一次性 / 未知周期：剩余为全额，已用 0
 * - 提前续费超过一个周期时，剩余价值可能高于本期价格，已用价值按 0 兜底
 */
export function getBillingValues(
  price: number,
  billingCycle: number,
  expiredAt?: string | number | null
): BillingValues {
  if (!Number.isFinite(price) || price <= 0) {
    return { used: 0, remaining: 0 };
  }
  if (!expiredAt) {
    return { used: price, remaining: 0 };
  }
  const end = new Date(expiredAt).getTime();
  if (!Number.isFinite(end) || end <= Date.now()) {
    return { used: price, remaining: 0 };
  }
  const days = Math.ceil((end - Date.now()) / MS_PER_DAY);
  if (days > LONG_TERM_DAYS) {
    return { used: 0, remaining: price };
  }
  if (!Number.isFinite(billingCycle) || billingCycle <= 0) {
    return { used: 0, remaining: price };
  }
  const remaining = roundAmount(price * (days / billingCycle));
  return { used: Math.max(0, roundAmount(price - remaining)), remaining };
}

/** 金额显示：保留两位小数并去掉多余的 0 */
export function formatCurrencyValue(value: number, currency = "￥"): string {
  const rounded = roundAmount(Number.isFinite(value) ? value : 0);
  const text = rounded.toFixed(2).replace(/\.?0+$/, "");
  return `${currency}${text || "0"}`;
}
