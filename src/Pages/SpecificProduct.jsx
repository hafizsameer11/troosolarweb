import React, { useEffect, useMemo, useState, useContext } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";

import SideBar from "../Component/SideBar";
import SearchBar from "../Component/SearchBar";
import Product from "../Component/Product";
import ProductBrandFilter from "../Component/ProductBrandFilter";
import ProductPriceFilter from "../Component/ProductPriceFilter";
import TopNavbar from "../Component/TopNavbar";
import HrLine from "../Component/MobileSectionResponsive/HrLine";
import Items from "../Component/Items";

import API, { BASE_URL } from "../config/api.config";
import { ContextApi } from "../Context/AppContext";
import { assets } from "../assets/data";
import { SearchIcon, ShoppingCart, ChevronLeft, ChevronRight } from "lucide-react";
import SolarBundleComponent from "../Component/SolarBundleComponent";
import { apiFlagTrue } from "../utils/apiFlags";
import {
  sortMappedBundleCards,
  sortMappedProductCards,
} from "../utils/bundleSort";
import { isProductPriceSortCategory, isSolarInverterBatteryBundle, isInverterBatteryBundle } from "../utils/storeCatalog";
import { withShopSource } from "../utils/shopSource";

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, "");

/** Map specific category pages to bundle types from Buy Solar Bundles. */
const getBundleTypeForCategoryPage = (categoryId, cat) => {
  const idStr = String(categoryId);
  const label = String(cat?.name || cat?.title || "")
    .trim()
    .toLowerCase();
  if (idStr === "25" || label === "solar bundles") {
    return "Solar+Inverter+Battery";
  }
  if (idStr === "26" || label === "inverter bundles") {
    return "Inverter + Battery";
  }
  return null;
};

const toAbsoluteBundleImage = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${API_ORIGIN}${path}`;
  const cleaned = path.replace(/^public\//, "");
  return `${API_ORIGIN}/storage/${cleaned}`;
};

const BUNDLE_FALLBACK_IMAGE =
  "https://api.troosolar.com/storage/products/d5c7f116-57ed-46ef-a659-337c94c308a9.png";

const normalizeBundlesResponse = (data) => {
  const root = data?.data ?? data;
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.data)) return root.data;
  if (root && typeof root === "object") return [root];
  return [];
};

const toNumber = (v) =>
  typeof v === "number"
    ? v
    : Number(String(v ?? "").replace(/[^\d.]/g, "")) || 0;

const parseStockQuantity = (stockValue) => {
  if (stockValue == null) return 0;
  if (typeof stockValue === "number") return Number.isFinite(stockValue) ? stockValue : 0;
  const text = String(stockValue).trim().toLowerCase();
  if (!text) return 0;
  const compactText = text.replace(/[\s_-]/g, "");
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric;
  if (
    text.includes("out of stock") ||
    compactText === "outofstock" ||
    text === "unavailable" ||
    text === "false"
  ) {
    return 0;
  }
  if (
    text.includes("in stock") ||
    compactText === "instock" ||
    text === "available" ||
    text === "true"
  ) {
    return 1;
  }
  const extracted = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(extracted) ? extracted : 0;
};

const formatNGN = (n) => {
  const num = toNumber(n);
  try {
    return `₦${new Intl.NumberFormat("en-NG").format(num)}`;
  } catch {
    return `₦${num}`;
  }
};

const mapBundleToGridItem = (b) => {
  const image = b?.featured_image
    ? toAbsoluteBundleImage(b.featured_image)
    : BUNDLE_FALLBACK_IMAGE;
  const title = b?.title || `Bundle #${b?.id ?? ""}`;
  const total = Number(b?.total_price ?? 0);
  const discount = Number(b?.discount_price ?? 0);
  const showDiscount = discount > 0 && discount < total;
  const priceNum = showDiscount ? discount : total;
  const price = formatNGN(priceNum);
  const oldPrice = showDiscount ? formatNGN(total) : "";
  const pct = showDiscount && total > 0 ? Math.round((1 - discount / total) * 100) : 0;
  const discountBadge = showDiscount ? `-${pct}%` : "";
  return {
    id: b?.id,
    image,
    heading: title,
    price,
    oldPrice,
    discount: discountBadge,
    rating: assets?.fiveStars || assets?.rating || "",
    bundleTitle: b?.bundle_type || "",
    inverterRating:
      b?.inver_rating ?? b?.inverter_rating ?? b?.inverterRating ?? "",
    borderColor: "#273e8e",
    _price_numeric: priceNum,
    _category_id: b?.category_id,
    bundle: b,
    isHotDeal: apiFlagTrue(b?.top_deal),
    isRecommended: apiFlagTrue(b?.is_most_popular),
  };
};

const mapApiProductToCard = (p) => {
  if (!p) return null;
  const stockQty = parseStockQuantity(p?.stock);

  const image =
    p.featured_image ||
    p?.images?.[0]?.image ||
    assets?.placeholderProduct ||
    "/placeholder-product.png";

  const heading =
    p.name || p.title || p.product_name || `Product #${p.id ?? ""}`;

  const priceRaw = p.price ?? p.amount ?? p.sale_price ?? p.product_price;
  const oldRaw = p.compare_at_price ?? p.old_price;

  const price = formatNGN(priceRaw);
  const oldPrice = oldRaw != null ? formatNGN(oldRaw) : "";

  let discount = "";
  const oldNum = toNumber(oldRaw);
  const priceNum = toNumber(priceRaw);
  if (oldNum > priceNum && oldNum > 0) {
    const pct = Math.round(((oldNum - priceNum) / oldNum) * 100);
    discount = `-${pct}%`;
  }

  const reviews = Array.isArray(p?.reviews) ? p.reviews : [];
  const ratingAvg =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + Number(r?.rating ?? 0), 0) / reviews.length
      : 0;

  return {
    id: p.id,
    image,
    heading,
    price,
    oldPrice,
    discount,
    ratingAvg,
    ratingCount: reviews.length,
    isHotDeal: apiFlagTrue(p?.top_deal),
    isRecommended: apiFlagTrue(p?.is_most_popular),
    _price_numeric: priceNum,
    _category_id: p.category_id,
    stock: stockQty,
  };
};

// Pull an array out of common Laravel API shapes
const extractArray = (payload) => {
  const root = payload?.data ?? payload;

  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.data)) return root.data;
  if (Array.isArray(root?.data?.data)) return root.data.data;

  if (
    root?.data &&
    typeof root.data === "object" &&
    !Array.isArray(root.data)
  ) {
    return Object.values(root.data);
  }
  if (root && typeof root === "object") {
    const candidates = Object.values(root).filter((v) => typeof v === "object");
    if (
      candidates.length === 1 &&
      candidates[0] &&
      !Array.isArray(candidates[0])
    ) {
      return Object.values(candidates[0]);
    }
  }
  return [];
};

const SpecificProduct = () => {
  const { id } = useParams(); // category ID from /product/:id
  const { registerProducts } = useContext(ContextApi);

  // category details
  const [category, setCategory] = useState(null);
  const [catLoading, setCatLoading] = useState(false);
  const [catError, setCatError] = useState("");
  const [allCategories, setAllCategories] = useState([]);
  const [allCategoriesLoading, setAllCategoriesLoading] = useState(false);

  // products in this category
  const [allProducts, setAllProducts] = useState([]); // full set for this category
  const [specificProduct, setSpecificProduct] = useState([]); // currently displayed list
  const [prodLoading, setProdLoading] = useState(false);
  const [prodError, setProdError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // fetch category details
  useEffect(() => {
    const fetchCategory = async () => {
      setCatLoading(true);
      setCatError("");
      try {
        const token = localStorage.getItem("access_token");
        const { data } = await axios.get(API.CATEGORY_BY_ID(id), {
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        setCategory(data?.data ?? data ?? null);
      } catch (e) {
        setCategory(null);
        setCatError(
          e?.response?.data?.message || e?.message || "Failed to load category."
        );
      } finally {
        setCatLoading(false);
      }
    };
    if (id) fetchCategory();
  }, [id]);

  // Fetch all categories for the heading strip, so category links remain visible
  useEffect(() => {
    const fetchCategories = async () => {
      setAllCategoriesLoading(true);
      try {
        const token = localStorage.getItem("access_token");
        const { data } = await axios.get(API.CATEGORIES, {
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        setAllCategories(Array.isArray(data?.data) ? data.data : []);
      } catch {
        setAllCategories([]);
      } finally {
        setAllCategoriesLoading(false);
      }
    };
    fetchCategories();
  }, []);

  const bundleTypeForPage = useMemo(
    () => getBundleTypeForCategoryPage(id, category),
    [id, category]
  );
  const bundleCategoryShop = Boolean(bundleTypeForPage);

  // fetch category products, or bundle cards for mapped bundle-category pages
  useEffect(() => {
    const fetchCategoryProducts = async () => {
      setProdLoading(true);
      setProdError("");
      try {
        const token = localStorage.getItem("access_token");
        const headers = {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        if (bundleTypeForPage) {
          const typeEnc = encodeURIComponent(bundleTypeForPage);
          const bundleMatcher =
            bundleTypeForPage === "Inverter + Battery"
              ? isInverterBatteryBundle
              : isSolarInverterBatteryBundle;
          const { data: bundleResp } = await axios.get(
            `${API.BUNDLES}?bundle_type=${typeEnc}`,
            { headers }
          );
          let rawBundles = normalizeBundlesResponse(bundleResp).filter(bundleMatcher);
          if (!rawBundles.length) {
            const { data: allBundlesResp } = await axios.get(API.BUNDLES, {
              headers,
            });
            rawBundles = normalizeBundlesResponse(allBundlesResp).filter(bundleMatcher);
          }
          registerProducts([]);
          const mapped = rawBundles.map(mapBundleToGridItem).filter(Boolean);
          setAllProducts(mapped);
          setSpecificProduct(mapped);
          return;
        }

        // 1) try /categories/:id/products (if you have it in api.config)
        const { data: catResp } = await axios.get(API.CATEGORY_PRODUCTS(id), {
          headers,
        });
        let rawList = extractArray(catResp);

        // 2) Fallback: if empty, pull /products and filter client-side
        if (!rawList.length) {
          const { data: allResp } = await axios.get(API.PRODUCTS, { headers });
          const every = extractArray(allResp);
          rawList = every.filter((p) => String(p?.category_id) === String(id));
        }

        // 3) Always restrict to this category (so only e.g. Solar Panels show on /product/7, not inverters/batteries)
        rawList = rawList.filter(
          (p) =>
            String(p?.category_id) === String(id) &&
            parseStockQuantity(p?.stock) > 0
        );

        // Keep original raw in Context for cart (if your cart uses it)
        registerProducts(rawList);

        const mapped = rawList.map(mapApiProductToCard).filter(Boolean);
        setAllProducts(mapped);
        setSpecificProduct(mapped); // default view: all
      } catch (e) {
        setAllProducts([]);
        setSpecificProduct([]);
        setProdError(
          e?.response?.data?.message || e?.message || "Failed to load products."
        );
      } finally {
        setProdLoading(false);
      }
    };
    if (id) fetchCategoryProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    id,
    // When slug is /product/25 or /product/26, category name is not needed; avoid refetch when category loads.
    String(id) === "25" || String(id) === "26" ? undefined : category,
  ]);

  // price filter
  const handlePriceFilter = (min, max) => {
    const minNum = min == null ? -Infinity : Number(min);
    const maxNum = max == null ? Infinity : Number(max);
    const filtered = allProducts.filter((p) => {
      const n = Number(p._price_numeric || 0);
      return n >= minNum && n <= maxNum;
    });
    setSpecificProduct(filtered);
  };

  // brand dropdown result handler
  // result === "__ALL__" -> restore allProducts
  // result === raw products array from /brands/{ids}/products -> map + restrict to this category (just in case)
  const handleBrandFilterResult = (result) => {
    if (bundleCategoryShop) {
      setSpecificProduct(allProducts);
      return;
    }
    if (result === "__ALL__") {
      setSpecificProduct(allProducts);
      return;
    }
    const sameCat = (Array.isArray(result) ? result : []).filter(
      (p) =>
        String(p?.category_id) === String(id) &&
        parseStockQuantity(p?.stock) > 0
    );
    const mapped = sameCat.map(mapApiProductToCard).filter(Boolean);
    setSpecificProduct(mapped);
  };

  const displayCategoryName = useMemo(() => {
    return category?.name || category?.title || `Category #${id}`;
  }, [category, id]);

  const sortedProducts = useMemo(() => {
    if (!specificProduct.length) return specificProduct;
    if (bundleCategoryShop) {
      return sortMappedBundleCards(specificProduct);
    }
    return sortMappedProductCards(specificProduct, {
      priceFirst: isProductPriceSortCategory(displayCategoryName),
    });
  }, [specificProduct, bundleCategoryShop, displayCategoryName]);

  const totalItems = sortedProducts.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const paginatedProducts = useMemo(() => {
    if (!bundleCategoryShop) return sortedProducts;
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedProducts.slice(start, end);
  }, [sortedProducts, bundleCategoryShop, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [id, bundleCategoryShop, totalItems]);

  const handlePageChange = (nextPage) => {
    if (nextPage < 1 || nextPage > totalPages) return;
    setCurrentPage(nextPage);
  };

  return (
    <>
      {/* Desktop View */}
      <div className="sm:flex hidden w-full min-h-screen bg-gray-100">
        <div className="w-[250px] min-w-[250px] shrink-0">
          <SideBar />
        </div>

        <div className="flex-1 flex flex-col">
          <TopNavbar />

          <div className="bg-[#273e8e] border-l-2 border-gray-500 px-6 py-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="min-w-[140px]">
                <h1 className="text-md font-semibold text-white">
                  {catLoading ? "Loading…" : displayCategoryName}
                </h1>
                <p className="text-white text-[12px]">
                  {catError
                    ? "Couldn't load category."
                    : `Shop for ${displayCategoryName}`}
                </p>
              </div>
              <SearchBar categories={allCategories} products={allProducts} />
            </div>
            <Items categories={allCategories} loading={allCategoriesLoading} />
          </div>

          <div className="px-6 py-6 flex-1 overflow-auto">
            <div className="relative z-[100] flex justify-start items-center gap-4 mb-4">
              {!bundleCategoryShop && (
                <ProductBrandFilter
                  categoryId={id}
                  onFilter={handleBrandFilterResult}
                />
              )}
              <ProductPriceFilter onFilter={handlePriceFilter} />
            </div>

            <h1 className="text-xl font-semibold text-black-800 my-4">
              {displayCategoryName}
            </h1>

            {prodError && (
              <p className="text-red-600 text-sm mb-3">{prodError}</p>
            )}
            {prodLoading && <p className="text-gray-600 text-sm">Loading…</p>}

            <div
              className={
                bundleCategoryShop
                  ? "grid xl:grid-cols-4 lg:grid-cols-3 md:grid-cols-2 sm:grid-cols-1 gap-4"
                  : "grid xl:grid-cols-3 lg:grid-cols-2 md:grid-cols-2 sm:grid-cols-1 gap-4"
              }
            >
              {bundleCategoryShop
                ? paginatedProducts.map((item) => (
                    <SolarBundleComponent
                      key={item.id}
                      id={item.id}
                      image={item.image}
                      heading={item.heading}
                      price={item.price}
                      oldPrice={item.oldPrice}
                      discount={item.discount}
                      rating={item.rating}
                      borderColor={item.borderColor}
                      bundleTitle={item.bundleTitle}
                      inverterRating={item.inverterRating}
                      isHotDeal={item.isHotDeal}
                      isRecommended={item.isRecommended}
                    />
                  ))
                : specificProduct.map((item) => (
                    <Link key={item.id} to={withShopSource(`/homePage/product/${item.id}`)}>
                      <Product
                        id={item.id}
                        image={item.image}
                        heading={item.heading}
                        price={item.price}
                        oldPrice={item.oldPrice}
                        discount={item.discount}
                        ratingAvg={item.ratingAvg}
                        ratingCount={item.ratingCount}
                        isHotDeal={item.isHotDeal}
                        isRecommended={item.isRecommended}
                        stock={item.stock}
                      />
                    </Link>
                  ))}
              {!prodLoading && !specificProduct.length && !prodError && (
                <div className="text-gray-500 bg-white border rounded-xl p-4">
                  {bundleCategoryShop
                    ? `No ${bundleTypeForPage} bundles are available right now.`
                    : "No products in this category."}
                </div>
              )}
            </div>
            {bundleCategoryShop && !prodLoading && !prodError && totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-8">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="px-4 text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </div>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile View */}
      <div className="flex sm:hidden w-full min-h-screen bg-gray-100">
        <div className="flex-1 flex flex-col">
          <div className="bg-[#273e8e] border-l-2 border-gray-500 px-6 py-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex justify-between w-full items-center">
                <div>
                  <h1 className="text-2xl font-semibold text-white">
                    {catLoading ? "Loading…" : displayCategoryName}
                  </h1>
                  <p className="text-white">
                    {catError
                      ? "Couldn't load category."
                      : `Shop for ${displayCategoryName}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 flex justify-center items-center bg-[#1D3073] rounded-lg">
                    <SearchIcon size={18} color="white" />
                  </div>
                  <div className="w-9 h-9 flex justify-center items-center bg-[#1D3073] rounded-lg">
                    <ShoppingCart size={18} color="white" />
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-[100] flex h-[70px] justify-center items-center mb-4">
              {!bundleCategoryShop && (
                <ProductBrandFilter
                  categoryId={id}
                  onFilter={handleBrandFilterResult}
                />
              )}
              {!bundleCategoryShop && (
                <div className="h-full flex items-center px-3">
                  <div className="h-[50px] w-[4px] bg-white rounded" />
                </div>
              )}
              <ProductPriceFilter onFilter={handlePriceFilter} />
            </div>
          </div>
          <Items categories={allCategories} loading={allCategoriesLoading} />

          <div className="px-6 py-6 flex-1 overflow-auto">
            <HrLine text={displayCategoryName} />

            {prodError && (
              <p className="text-red-600 text-sm mb-3">{prodError}</p>
            )}
            {prodLoading && <p className="text-gray-600 text-sm">Loading…</p>}

            <div
              className={
                bundleCategoryShop
                  ? "grid grid-cols-1 place-items-stretch gap-4 w-full"
                  : "grid grid-cols-2 place-items-center gap-4"
              }
            >
              {bundleCategoryShop
                ? paginatedProducts.map((item) => (
                    <SolarBundleComponent
                      key={item.id}
                      id={item.id}
                      image={item.image}
                      heading={item.heading}
                      price={item.price}
                      oldPrice={item.oldPrice}
                      discount={item.discount}
                      rating={item.rating}
                      borderColor={item.borderColor}
                      bundleTitle={item.bundleTitle}
                      inverterRating={item.inverterRating}
                      isHotDeal={item.isHotDeal}
                      isRecommended={item.isRecommended}
                    />
                  ))
                : specificProduct.map((item) => (
                    <Link key={item.id} to={withShopSource(`/homePage/product/${item.id}`)}>
                      <Product
                        id={item.id}
                        image={item.image}
                        heading={item.heading}
                        price={item.price}
                        oldPrice={item.oldPrice}
                        discount={item.discount}
                        ratingAvg={item.ratingAvg}
                        ratingCount={item.ratingCount}
                        isHotDeal={item.isHotDeal}
                        isRecommended={item.isRecommended}
                        stock={item.stock}
                      />
                    </Link>
                  ))}
              {!prodLoading && !specificProduct.length && !prodError && (
                <div className="text-gray-500 bg-white border rounded-xl p-4 col-span-2 w-full text-center">
                  {bundleCategoryShop
                    ? `No ${bundleTypeForPage} bundles are available right now.`
                    : "No products in this category."}
                </div>
              )}
            </div>
            {bundleCategoryShop && !prodLoading && !prodError && totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-6 pb-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="px-3 text-sm text-gray-600">
                  {currentPage} / {totalPages}
                </div>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SpecificProduct;
