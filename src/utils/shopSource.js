/**
 * Mark catalog detail links as coming from Solar Shop / store,
 * so product & bundle detail pages show Add to Cart instead of Buy Now / BNPL.
 */
export function withShopSource(path) {
  if (!path) return path;
  const hashIndex = path.indexOf("#");
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const qIndex = withoutHash.indexOf("?");
  const base = qIndex >= 0 ? withoutHash.slice(0, qIndex) : withoutHash;
  const params = new URLSearchParams(
    qIndex >= 0 ? withoutHash.slice(qIndex + 1) : ""
  );
  params.set("from", "shop");
  const qs = params.toString();
  return `${base}?${qs}${hash}`;
}

export function isFromShop(searchParams) {
  if (!searchParams) return false;
  const value =
    typeof searchParams.get === "function"
      ? searchParams.get("from")
      : new URLSearchParams(searchParams).get("from");
  return value === "shop";
}
