/**
 * Bundle catalog prices — Buy Now vs BNPL.
 */

export function bundleBuyNowPrice(bundle) {
  if (!bundle || typeof bundle !== "object") return 0;
  if (bundle.buy_now_price != null && Number(bundle.buy_now_price) > 0) {
    return Number(bundle.buy_now_price);
  }
  const discount = Number(bundle.discount_price ?? 0);
  const total = Number(bundle.total_price ?? 0);
  return discount > 0 ? discount : total;
}

/** BNPL catalog price; falls back to Buy Now when bnpl_price is not set. */
export function bundleBnplPrice(bundle) {
  if (!bundle || typeof bundle !== "object") return 0;
  if (bundle.effective_bnpl_price != null && Number(bundle.effective_bnpl_price) > 0) {
    return Number(bundle.effective_bnpl_price);
  }
  const bnpl = Number(bundle.bnpl_price ?? 0);
  if (bnpl > 0) return bnpl;
  return bundleBuyNowPrice(bundle);
}
