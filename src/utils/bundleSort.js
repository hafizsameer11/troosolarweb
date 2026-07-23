import { apiFlagTrue } from "./apiFlags";
import {
  isBundleStoreCategory,
  isProductPriceSortCategory,
} from "./storeCatalog";

/** Top deal / hot — tolerate snake_case, camelCase, alternate keys from APIs. */
export const entityTopDeal = (x) =>
  apiFlagTrue(
    x?.top_deal ?? x?.topDeal ?? x?.is_top_deal ?? x?.isTopDeal ?? x?.hot_deal
  );

/** Highly recommended / popular — tolerate naming variants. */
export const entityHighlyRecommended = (x) =>
  apiFlagTrue(
    x?.is_most_popular ??
      x?.isMostPopular ??
      x?.is_recommended ??
      x?.isRecommended ??
      x?.highly_recommended ??
      x?.highlyRecommended
  );

/** Parse kVA from explicit rating fields (digits only). */
const parseKvaFromFields = (value) => {
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Stable inverter kVA for ordering (smallest → largest).
 * Falls back to title / product_model / specifications when API rating is missing.
 */
export const extractKvaFromBundle = (b) => {
  if (!b || typeof b !== "object") return 0;
  let k = parseKvaFromFields(
    b.inver_rating ?? b.inverter_rating ?? b.inverterRating ?? ""
  );
  if (k > 0) return k;

  const tryText = (text) => {
    const s = String(text ?? "");
    if (!s) return 0;
    let m = s.match(/(\d+(?:\.\d+)?)\s*kVA/i);
    if (m) return Number(m[1]) || 0;
    m = s.match(/(\d+(?:\.\d+)?)\s*kv(?:a)?(?:\/|\b|$)/i);
    if (m) return Number(m[1]) || 0;
    m = s.match(/\+\s*(\d+(?:\.\d+)?)\s*kVA/i);
    if (m) return Number(m[1]) || 0;
    // Bundle titles often use kW for inverter size (e.g. 2.4kWp+5kW+5kWh).
    m = s.match(/(\d+(?:\.\d+)?)\s*kW\b/i);
    if (m) return Number(m[1]) || 0;
    m = s.match(/\+(\d+(?:\.\d+)?)kW/i);
    if (m) return Number(m[1]) || 0;
    return 0;
  };

  for (const text of [
    b.title,
    b.heading,
    b.name,
    b.product_model,
  ]) {
    k = tryText(text);
    if (k > 0) return k;
  }

  try {
    const specs =
      typeof b.specifications === "string"
        ? JSON.parse(b.specifications)
        : b.specifications;
    if (specs && typeof specs === "object") {
      k = parseKvaFromFields(
        specs.inverter_capacity_kva ?? specs.inverter_capacity
      );
      if (k > 0) return k;
    }
  } catch {
    /* ignore */
  }

  return 0;
};

/** Normalize watts or kVA to one-decimal kVA (e.g. 4000 → 4, 1.5 → 1.5). */
export const normalizeKvaValue = (value) => {
  const n =
    typeof value === "number"
      ? value
      : parseFloat(String(value ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const kva = n > 100 ? n / 1000 : n;
  if (kva <= 0 || kva > 30) return null;
  return Math.round(kva * 10) / 10;
};

/**
 * Parse capacity from search box: 4kv, 4kva, 1.5, 1.5kVA/12V, 4 kW, etc.
 * Works regardless of size dropdown visibility (Solar Store uses showSizeFilter=false).
 */
export const parseKvaFromSearchQuery = (q) => {
  const raw = String(q ?? "").trim().toLowerCase();
  if (!raw) return null;

  const capacityPatterns = [
    /^(\d+(?:\.\d+)?)\s*kv(?:a)?(?:\/|\b|$|\s)/i,
    /(\d+(?:\.\d+)?)\s*kv(?:a)?(?:\/|\b|$|\s)/i,
    /^(\d+(?:\.\d+)?)\s*kw\b/i,
    /(\d+(?:\.\d+)?)\s*kw\b/i,
  ];

  for (const pattern of capacityPatterns) {
    const m = raw.match(pattern);
    if (m) {
      const parsed = normalizeKvaValue(parseFloat(m[1]));
      if (parsed != null) return parsed;
    }
  }

  if (/^(\d+(?:\.\d+)?)$/.test(raw)) {
    return normalizeKvaValue(parseFloat(raw));
  }

  return null;
};

/** True when a catalog card matches a target inverter kVA (bundles + inverters). */
export const catalogItemMatchesKva = (item, targetKva) => {
  if (targetKva == null || !Number.isFinite(targetKva)) return false;
  const target = Math.round(targetKva * 10) / 10;

  const candidates = [item?.bundle, item].filter(
    (x) => x && typeof x === "object"
  );

  for (const src of candidates) {
    const fromExtract = normalizeKvaValue(extractKvaFromBundle(src));
    if (fromExtract != null && fromExtract === target) return true;

    const raw = String(
      src.inver_rating ?? src.inverter_rating ?? src.inverterRating ?? ""
    ).trim();
    if (raw) {
      const fromField = normalizeKvaValue(parseFloat(raw.replace(/[^\d.]/g, "")));
      if (fromField != null && fromField === target) return true;
    }
  }

  const title = item?.heading || item?.title || item?.name || "";
  const tm = String(title).match(/(\d+(?:\.\d+)?)\s*k(?:v(?:a)?|w)\b/i);
  if (tm) {
    const fromTitle = normalizeKvaValue(parseFloat(tm[1]));
    if (fromTitle != null && fromTitle === target) return true;
  }

  if (item?.itemType !== "bundle" && !item?.bundle) {
    const pk = normalizeKvaValue(
      extractKvaFromProduct({
        title: item?.heading,
        name: item?.heading,
        ...(item?.product || {}),
      })
    );
    if (pk != null && pk === target) return true;
  }

  return false;
};

const formatKvaNumber = (k) => {
  const n = Number(k);
  if (!Number.isFinite(n) || n <= 0) return "";
  return Number(n) % 1 === 0 ? String(Math.round(n)) : String(n);
};

/** Display label for bundle card kVA badge (e.g. "5kVA"). */
export const formatBundleKvaLabel = (b) => {
  if (!b || typeof b !== "object") return "";
  const k = extractKvaFromBundle(b);
  if (k > 0) {
    const displayK = k > 100 && !/kva|kw/i.test(String(
      b.inver_rating ?? b.inverter_rating ?? b.inverterRating ?? ""
    ))
      ? k / 1000
      : k;
    const formatted = formatKvaNumber(displayK);
    return formatted ? `${formatted}kVA` : "";
  }
  const raw = String(
    b.inver_rating ?? b.inverter_rating ?? b.inverterRating ?? ""
  ).trim();
  if (!raw) return "";
  if (/kva/i.test(raw)) return raw;
  const num = parseFloat(raw.replace(/[^\d.]/g, ""));
  if (Number.isFinite(num) && num > 100) {
    const formatted = formatKvaNumber(num / 1000);
    return formatted ? `${formatted}kVA` : "";
  }
  return `${raw}kVA`;
};

/** Value for SolarBundleComponent / Buy Now style badges (raw or formatted). */
export const resolveBundleInverterRatingDisplay = (b) => {
  if (!b || typeof b !== "object") return "";
  const raw = String(
    b.inver_rating ?? b.inverter_rating ?? b.inverterRating ?? ""
  ).trim();
  if (raw) {
    if (/kva/i.test(raw)) return raw;
    const num = parseFloat(raw.replace(/[^\d.]/g, ""));
    if (Number.isFinite(num) && num > 100) {
      const formatted = formatKvaNumber(num / 1000);
      return formatted ? `${formatted}kVA` : raw;
    }
    return raw;
  }
  return formatBundleKvaLabel(b);
};

/** Parse inverter kW/kVA from product title for grid ordering. */
export const extractKvaFromProduct = (p) => {
  if (!p || typeof p !== "object") return 0;
  const title = String(p.title ?? p.name ?? "");
  if (!title) return 0;

  let m = title.match(/(\d+(?:\.\d+)?)\s*k(?:W|VA)\b/i);
  if (m) return Number(m[1]) || 0;

  m = title.match(/(\d+(?:\.\d+)?)\s*(?:W|VA)\b/i);
  if (m) {
    const value = Number(m[1]) || 0;
    return value >= 100 ? value / 1000 : value;
  }

  return 0;
};

/** Preserve API order while removing duplicate product ids. */
export const dedupeProductsById = (arr) => {
  const seen = new Set();
  const out = [];
  for (const p of arr || []) {
    const id = p?.id;
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    out.push(p);
  }
  return out;
};

export const bundleFeaturedRank = (b) =>
  entityTopDeal(b) || entityHighlyRecommended(b) ? 1 : 0;

/** Stronger promo ordering: both badges → top deal only → recommended only → rest. */
const bundlePromoRank = (b) => {
  const hot = entityTopDeal(b);
  const pop = entityHighlyRecommended(b);
  if (hot && pop) return 3;
  if (hot) return 2;
  if (pop) return 1;
  return 0;
};

/** BNPL / Buy Now bundle step: promos first, then ascending kVA, then id. */
export const sortBundlesFeaturedThenKvaAsc = (arr) => {
  if (!Array.isArray(arr)) return [];
  return [...arr].sort((a, b) => {
    const ra = bundlePromoRank(a);
    const rb = bundlePromoRank(b);
    if (rb !== ra) return rb - ra;
    const ak = extractKvaFromBundle(a);
    const bk = extractKvaFromBundle(b);
    if (ak !== bk) return ak - bk;
    return Number(a?.id ?? 0) - Number(b?.id ?? 0);
  });
};

/** Product promo priority: both badges → top deal → highly recommended → rest. */
export const productPromoRank = (p) => {
  const hot = entityTopDeal(p);
  const pop = entityHighlyRecommended(p);
  if (hot && pop) return 3;
  if (hot) return 2;
  if (pop) return 1;
  return 0;
};

/** Effective customer price (discount when active, else list price). */
export const extractProductEffectivePrice = (p) => {
  const discount = Number(p?.discount_price ?? 0);
  const price = Number(p?.price ?? 0);
  if (discount > 0 && (price <= 0 || discount < price)) return discount;
  if (price > 0) return price;
  return discount > 0 ? discount : 0;
};

/** Inverter / battery / panels-only grids: promos first, then ascending price, then id. */
export const sortProductsByPromoThenPriceAsc = (arr) => {
  if (!Array.isArray(arr)) return [];
  return [...arr].sort((a, b) => {
    const ra = productPromoRank(a);
    const rb = productPromoRank(b);
    if (rb !== ra) return rb - ra;
    const ap = extractProductEffectivePrice(a);
    const bp = extractProductEffectivePrice(b);
    if (ap !== bp) return ap - bp;
    return Number(a?.id ?? 0) - Number(b?.id ?? 0);
  });
};

export const PRODUCT_ONLY_CATEGORY_KEYS = new Set([
  "battery-only",
  "inverter-only",
  "panels-only",
]);

/** Product-only categories: promo + price; build-system / mixed: promo + kVA. */
export const sortCategoryProducts = (arr, categoryKey) =>
  PRODUCT_ONLY_CATEGORY_KEYS.has(categoryKey)
    ? sortProductsByPromoThenPriceAsc(arr)
    : sortProductsByPromoFirst(arr);

/** Product grids: promo badges first, then ascending capacity, then id. */
export const sortProductsByPromoFirst = (arr) => {
  if (!Array.isArray(arr)) return [];
  return [...arr].sort((a, b) => {
    const ra = productPromoRank(a);
    const rb = productPromoRank(b);
    if (rb !== ra) return rb - ra;
    const ak = extractKvaFromProduct(a);
    const bk = extractKvaFromProduct(b);
    if (ak !== bk) return ak - bk;
    return Number(a?.id ?? 0) - Number(b?.id ?? 0);
  });
};

/** Raw API bundles: ascending kVA, then featured, then id. */
export const sortBundlesByKvaAsc = (arr) => {
  if (!Array.isArray(arr)) return [];
  return [...arr].sort((a, b) => {
    const ak = extractKvaFromBundle(a);
    const bk = extractKvaFromBundle(b);
    if (ak !== bk) return ak - bk;
    const ah = bundleFeaturedRank(a);
    const bh = bundleFeaturedRank(b);
    if (bh !== ah) return bh - ah;
    return Number(a?.id ?? 0) - Number(b?.id ?? 0);
  });
};

/** Resolve numeric bundle id from raw bundle or mapped storefront card. */
export const resolveBundleCardId = (card) => {
  if (card?.itemableId != null) return Number(card.itemableId);
  if (card?.bundle?.id != null) return Number(card.bundle.id);
  if (card?.id != null && typeof card.id === "number") return Number(card.id);
  const raw = String(card?.id ?? "");
  const match = raw.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : Number(raw) || 0;
};

/** SearchBar passes mapped cards `{ ...mapBundle(r), bundle: r }` — same order as main grid (promos first, then kVA asc). */
export const sortMappedBundleCards = (cards) => {
  const raw = (cards || []).map((card) => card.bundle || card);
  const sortedRaw = sortBundlesFeaturedThenKvaAsc(raw);
  const order = new Map(sortedRaw.map((b, i) => [Number(b?.id ?? 0), i]));
  return [...(cards || [])].sort((a, b) => {
    const idA = resolveBundleCardId(a);
    const idB = resolveBundleCardId(b);
    return (order.get(idA) ?? 9999) - (order.get(idB) ?? 9999);
  });
};

const mappedProductPromoRank = (card) => {
  const hot =
    card?.isHotDeal || entityTopDeal(card?.product || card);
  const pop =
    card?.isRecommended || entityHighlyRecommended(card?.product || card);
  if (hot && pop) return 3;
  if (hot) return 2;
  if (pop) return 1;
  return 0;
};

const extractMappedProductPrice = (card) => {
  if (card?._price_numeric != null) {
    const n = Number(card._price_numeric);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (card?.product) return extractProductEffectivePrice(card.product);
  const parsed = Number(
    String(card?.price ?? "").replace(/[^\d.]/g, "")
  );
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Mapped product cards: promos first, then ascending kVA, then id. */
export const sortMappedProductCards = (cards, { priceFirst = false } = {}) => {
  if (!Array.isArray(cards)) return [];
  return [...cards].sort((a, b) => {
    const ra = mappedProductPromoRank(a);
    const rb = mappedProductPromoRank(b);
    if (rb !== ra) return rb - ra;

    if (priceFirst) {
      const ap = extractMappedProductPrice(a);
      const bp = extractMappedProductPrice(b);
      if (ap !== bp) return ap - bp;
    } else {
      const ak = extractKvaFromProduct({
        title: a.heading,
        name: a.heading,
        ...(a.product || {}),
      });
      const bk = extractKvaFromProduct({
        title: b.heading,
        name: b.heading,
        ...(b.product || {}),
      });
      if (ak !== bk) return ak - bk;
    }

    const idA = Number(a.itemableId ?? a.id ?? 0);
    const idB = Number(b.itemableId ?? b.id ?? 0);
    return idA - idB;
  });
};

/**
 * Solar Store grid: bundle categories → bundle sort only;
 * product categories → product sort; All → products and bundles interleaved.
 */
export const sortStoreCatalogItems = (items, { categoryLabel = "" } = {}) => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const bundles = [];
  const products = [];
  for (const item of items) {
    if (item?.itemType === "bundle" || item?.bundle) bundles.push(item);
    else products.push(item);
  }

  const sortedBundles = sortMappedBundleCards(bundles);
  const priceFirst = isProductPriceSortCategory(categoryLabel);
  const sortedProducts = sortMappedProductCards(products, { priceFirst });

  if (isBundleStoreCategory(categoryLabel)) {
    return sortedBundles;
  }

  if (products.length > 0 && bundles.length === 0) {
    return sortedProducts;
  }

  if (bundles.length > 0 && products.length === 0) {
    return sortedBundles;
  }

  // Mix products and bundles so "All" is not bundle-only on page 1.
  const mixed = [];
  const maxLen = Math.max(sortedProducts.length, sortedBundles.length);
  for (let i = 0; i < maxLen; i += 1) {
    if (i < sortedProducts.length) mixed.push(sortedProducts[i]);
    if (i < sortedBundles.length) mixed.push(sortedBundles[i]);
  }
  return mixed;
};
