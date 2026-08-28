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

/** BNPL catalog price; falls back to Buy Now when bnpl list is not set. */
export function bundleBnplPrice(bundle) {
  if (!bundle || typeof bundle !== "object") return 0;
  if (bundle.effective_bnpl_price != null && Number(bundle.effective_bnpl_price) > 0) {
    return Number(bundle.effective_bnpl_price);
  }
  const bnplList = Number(bundle.bnpl_price ?? 0);
  if (bnplList > 0) {
    const bnplSale = Number(bundle.bnpl_discount_price ?? 0);
    return bnplSale > 0 && bnplSale < bnplList ? bnplSale : bnplList;
  }
  return bundleBuyNowPrice(bundle);
}

export function bundleListPrice(bundle) {
  return Number(bundle?.total_price ?? 0);
}

export function bundleBnplListPrice(bundle) {
  const bnplList = Number(bundle?.bnpl_price ?? 0);
  return bnplList > 0 ? bnplList : bundleListPrice(bundle);
}

export function bundleBuyNowDisplay(bundle) {
  const list = bundleListPrice(bundle);
  const price = bundleBuyNowPrice(bundle);
  const oldPrice = list > 0 && price < list ? list : null;
  const discount = oldPrice ? Math.round(((list - price) / list) * 100) : 0;
  return { price, oldPrice, discount };
}

/** BNPL card/detail pricing — uses BNPL list vs BNPL sale when configured. */
export function bundleBnplDisplay(bundle) {
  const list = bundleBnplListPrice(bundle);
  const price = bundleBnplPrice(bundle);
  const oldPrice = list > 0 && price < list ? list : null;
  const discount = oldPrice ? Math.round(((list - price) / list) * 100) : 0;
  return { price, oldPrice, discount };
}
