import React, { useContext, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { assets } from "../assets/data";
import SideBar from "../Component/SideBar";
import TopNavbar from "../Component/TopNavbar";
import LoanPopUp from "../Component/LoanPopUp";
import { BsExclamationTriangle } from "react-icons/bs";
import {
  Minus,
  Plus,
  Star,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
} from "lucide-react";
import { ContextApi } from "../Context/AppContext";
import API from "../config/api.config";
import ProductPromoBadges from "../Component/ProductPromoBadges";
import {
  BNPL_PROMO_COPY,
  BNPL_MIN_FALLBACK,
  fetchBnplMinimumLoanAmount,
  isBnplEligiblePrice,
} from "../utils/bnplEligibility";
import { isFromShop } from "../utils/shopSource";

/* ---------------- helpers ---------------- */
const formatNGN = (n) => {
  if (n == null || n === "") return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  try {
    return `₦${new Intl.NumberFormat("en-NG").format(num)}`;
  } catch {
    return `₦${num}`;
  }
};
const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
const safeArray = (v) => (Array.isArray(v) ? v : []);
const toNum = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const parseSpecificationItems = (specifications) => {
  if (specifications == null || specifications === "") return [];

  if (Array.isArray(specifications)) {
    return specifications
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (typeof specifications === "object") {
    return Object.entries(specifications)
      .map(([k, v]) => `${k}: ${v}`)
      .filter((item) => String(item).trim());
  }

  const asString = String(specifications).trim();
  if (!asString) return [];

  // If backend sends JSON string, parse and format nicely.
  try {
    const parsed = JSON.parse(asString);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    }
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed)
        .map(([k, v]) => `${k}: ${v}`)
        .filter((item) => String(item).trim());
    }
  } catch {
    // Plain text specification fallback.
  }

  return [asString];
};
const parseStockQuantity = (stockValue) => {
  if (stockValue == null) return 0;
  if (typeof stockValue === "number") return Number.isFinite(stockValue) ? stockValue : 0;
  const text = String(stockValue).trim().toLowerCase();
  if (!text) return 0;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric;
  if (text.includes("out of stock") || text === "unavailable" || text === "false") return 0;
  if (text.includes("in stock") || text === "available" || text === "true") return 1;
  const extracted = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(extracted) ? extracted : 0;
};
const avgRating = (list) => {
  if (!list.length) return 0;
  const sum = list.reduce((s, r) => s + toNum(r.rating), 0);
  return +(sum / list.length).toFixed(1);
};
const normalizeReview = (r) => ({
  id: r?.id,
  product_id: r?.product_id,
  user_id: r?.user_id,
  name:
    r?.name ||
    r?.user?.name ||
    [r?.user?.first_name, r?.user?.sur_name].filter(Boolean).join(" ") ||
    "User",
  rating: toNum(r?.rating, 0),
  review: r?.review || r?.comment || "",
  created_at: r?.created_at,
  admin_reply: (r?.admin_reply && String(r.admin_reply).trim()) ? String(r.admin_reply).trim() : "",
  admin_replied_at: r?.admin_replied_at || null,
});
const initials = (name = "") => {
  const parts = String(name).trim().split(/\s+/);
  return [(parts[0] || "U")[0], (parts[1] || "")[0]].join("").toUpperCase();
};
const fmtDate = (s) => {
  const d = new Date((s || "").replace(" ", "T"));
  if (isNaN(d)) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
};

// tiny star component
const Stars = ({ value = 0, size = 20 }) => {
  const full = Math.floor(value);
  const hasHalf = value - full >= 0.5;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < full || (i === full && hasHalf);
        return (
          <Star
            key={i}
            size={size}
            className={
              filled ? "fill-[#F8A91D] text-[#F8A91D]" : "text-gray-300"
            }
          />
        );
      })}
    </div>
  );
};

// Image Swiper
const ImageSwiper = ({ images, productTitle, baseUrl }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!images || images.length <= 1) {
    const singleImage = images?.[0] || { image: "/placeholder-product.png" };
    return (
      <div className="h-[400px] sm:h-[500px] w-full border border-gray-600 flex justify-center items-center bg-white rounded-xl p-4">
        <img
          src={
            singleImage.image?.startsWith("http")
              ? singleImage.image
              : `${baseUrl}${singleImage.image}`
          }
          alt={productTitle}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  const nextImage = () => setCurrentIndex((p) => (p + 1) % images.length);
  const prevImage = () =>
    setCurrentIndex((p) => (p - 1 + images.length) % images.length);
  const currentImage = images[currentIndex];

  return (
    <div className="relative">
      <div className="h-[400px] sm:h-[500px] w-full border border-gray-600 flex justify-center items-center bg-white rounded-xl p-4">
        <img
          src={
            currentImage.image?.startsWith("http")
              ? currentImage.image
              : `${baseUrl}${currentImage.image}`
          }
          alt={productTitle}
          className="h-full w-full object-contain"
        />
      </div>

      <button
        onClick={prevImage}
        className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow-md"
        aria-label="Previous image"
      >
        <ChevronLeft size={24} className="text-gray-700" />
      </button>

      <button
        onClick={nextImage}
        className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow-md"
        aria-label="Next image"
      >
        <ChevronRight size={24} className="text-gray-700" />
      </button>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
        {currentIndex + 1} / {images.length}
      </div>
    </div>
  );
};

/* map API -> details shape */
const mapApiProductToDetails = (p) => {
  if (!p) return null;

  const image =
    p?.featured_image_url ||
    p?.featured_image ||
    p?.images?.[0]?.image ||
    assets?.placeholderProduct ||
    "/placeholder-product.png";

  const priceRaw = toNum(p?.price, 0);
  const discountRaw =
    p?.discount_price != null ? toNum(p.discount_price, null) : null;

  let isDiscountActive = false;
  if (discountRaw != null && discountRaw > 0 && discountRaw < priceRaw) {
    isDiscountActive = p?.discount_end_date
      ? new Date(p.discount_end_date) > new Date()
      : true;
  }

  const effectiveRaw = isDiscountActive ? discountRaw : priceRaw;
  const oldRaw = isDiscountActive ? priceRaw : null;

  const current = parseStockQuantity(p?.stock);
  const total = Math.max(current, toNum(p?.old_quantity, current));
  const stockPct = total ? clamp(Math.round((current / total) * 100)) : 0;

  return {
    id: p?.id,
    image,
    heading: p?.title || `Product #${p?.id ?? ""}`,
    price: formatNGN(effectiveRaw),
    priceAmount: effectiveRaw,
    oldPrice: oldRaw != null ? formatNGN(oldRaw) : "",
    discount:
      isDiscountActive && priceRaw > 0
        ? `-${Math.round(((priceRaw - discountRaw) / priceRaw) * 100)}%`
        : "",
    categoryId: p?.category_id,
    details: safeArray(p?.details)
      .map((d) => d?.detail)
      .filter(Boolean),
    description: String(p?.description || "").trim(),
    specifications: parseSpecificationItems(p?.specifications),
    gallery: safeArray(p?.images)
      .map((i) => i?.image)
      .filter(Boolean),
    stockText: `${current}/${total}`,
    stockQty: current,
    stockPct,
    topDeal: !!p?.top_deal,
    isRecommended: !!p?.is_most_popular,
  };
};

/* ---------------- component ---------------- */
export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isShopMode = isFromShop(searchParams);
  const {
    addToCart,
    removeToCart,
    cartItems,
    registerProducts,
    fetchCartCount,
    showCartNotificationModal,
  } = useContext(ContextApi);

  const [installUnit, setInstallUnit] = useState(0);
  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [activeTab, setActiveTab] = useState("details");
  const [balance] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false); // NEW: Loading state for add to cart
  const [bnplMinimumAmount, setBnplMinimumAmount] = useState(BNPL_MIN_FALLBACK);

  // categories (for name)
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const t = localStorage.getItem("access_token");
        const { data } = await axios.get(API.CATEGORIES, {
          headers: {
            Accept: "application/json",
            ...(t ? { Authorization: `Bearer ${t}` } : {}),
          },
        });
        setCategories(Array.isArray(data?.data) ? data.data : []);
      } catch {}
    })();
  }, []);
  useEffect(() => {
    const t = localStorage.getItem("access_token");
    let cancelled = false;
    fetchBnplMinimumLoanAmount(t).then((min) => {
      if (!cancelled) setBnplMinimumAmount(min);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const showBnplPromo = useMemo(
    () =>
      !isShopMode &&
      isBnplEligiblePrice(product?.priceAmount, bnplMinimumAmount),
    [isShopMode, product?.priceAmount, bnplMinimumAmount]
  );
  const catMap = useMemo(() => {
    const m = {};
    for (const c of categories)
      if (c?.id) m[c.id] = c?.name || c?.title || c?.category_name || "";
    return m;
  }, [categories]);

  // product fetch
  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const t = localStorage.getItem("access_token");
        const { data } = await axios.get(API.PRODUCT_BY_ID(id), {
          headers: {
            Accept: "application/json",
            ...(t ? { Authorization: `Bearer ${t}` } : {}),
          },
        });
        const raw = data?.data ?? data;
        registerProducts?.(raw);
        setInstallUnit(toNum(raw?.installation_price, 0));

        const mapped = mapApiProductToDetails(raw);
        if (on) {
          if (!mapped?.id) setErr("Product not found.");
          else setProduct(mapped);

          const serverReviews = safeArray(raw?.reviews).map(normalizeReview);
          setReviews(serverReviews);
        }
      } catch (e) {
        if (on)
          setErr(
            e?.response?.data?.message ||
              e?.message ||
              "Failed to load product."
          );
      } finally {
        on && setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [id, registerProducts]);

  // Fetch product reviews directly so reviews are always available even
  // when the product payload doesn't embed review relations.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) return;
      try {
        const token = localStorage.getItem("access_token");
        const { data } = await axios.get(API.PRODUCT_REVIEWS, {
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          params: { product_id: id },
        });
        const list = safeArray(data?.data).map(normalizeReview);
        if (active) setReviews(list);
      } catch {
        // Keep fallback reviews from product details response.
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const qtyInCart = useMemo(() => {
    if (!product?.id) return 0;
    return cartItems[String(product.id)] || 0;
  }, [cartItems, product]);

  const rememberInstallPrice = (productId, unit) => {
    try {
      const key = "install_price_map";
      const cur = JSON.parse(localStorage.getItem(key) || "{}");
      cur[String(productId)] = Number(unit) || 0;
      localStorage.setItem(key, JSON.stringify(cur));
    } catch {}
  };

  // cart helpers
  const fetchCartAndFindLine = async (tok, productId) => {
    const res = await axios.get(API.CART, {
      headers: { Accept: "application/json", Authorization: `Bearer ${tok}` },
    });
    const payload = res?.data;
    const items = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
      ? payload
      : [];
    const pid = String(productId);
    return items.find((x) => {
      const a = String(x?.itemable_id ?? "");
      const b = String(x?.itemable?.id ?? "");
      return a === pid || b === pid;
    });
  };
  const syncLocalQty = (productId, serverQty) => {
    const localQty = cartItems[String(productId)] || 0;
    if (serverQty === localQty) return;
    if (serverQty > localQty) {
      const inc = Math.min(serverQty - localQty, 50);
      for (let i = 0; i < inc; i++) addToCart(productId);
    } else {
      const dec = Math.min(localQty - serverQty, 50);
      for (let i = 0; i < dec; i++) removeToCart(productId);
    }
  };

  const handleAddToCart = async () => {
    if (!product?.id || addingToCart) return false;
    if (Number(product?.stockQty ?? 0) <= 0) {
      toast.error("This product is out of stock.");
      return false;
    }
    const tok = localStorage.getItem("access_token");
    if (!tok) {
      toast.error("Please log in to add items to cart.");
      return false;
    }

    setAddingToCart(true);
    try {
      await axios.post(
        API.CART,
        {
          itemable_type: "product",
          itemable_id: Number(product.id),
          quantity: 1,
        },
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${tok}`,
          },
        }
      );
      const line = await fetchCartAndFindLine(tok, product.id);
      const serverQty = Number(line?.quantity || 1);
      rememberInstallPrice(product.id, installUnit);
      syncLocalQty(product.id, serverQty);
      fetchCartCount(); // Refresh global cart count
      // Show cart notification with correct product data
      showCartNotificationModal(product.heading, product.image);
      // Removed toast.success - only show loading indicator
      return true;
    } catch (e) {
      if (e?.response?.status === 409) {
        try {
          const line = await fetchCartAndFindLine(tok, product.id);
          if (!line) {
            toast.error("Item in cart, but couldn't locate to update.");
            return false;
          }
          const newQty = Number(line.quantity || 0) + 1;
          await axios.put(
            API.CART_ITEM(line.id),
            { quantity: newQty },
            {
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${tok}`,
              },
            }
          );
          rememberInstallPrice(product.id, installUnit);
          syncLocalQty(product.id, newQty);
          fetchCartCount(); // Refresh global cart count
          // Show cart notification with correct product data
          showCartNotificationModal(product.heading, product.image);
          // Removed toast.success - only show loading indicator
          return true;
        } catch (e2) {
          toast.error(
            e2?.response?.data?.message || e2.message || "Failed to update cart"
          );
          return false;
        }
      } else {
        toast.error(
          e?.response?.data?.message || e.message || "Failed to add to cart"
        );
        return false;
      }
    } finally {
      setAddingToCart(false);
    }
    return false;
  };

  const handleBuyNow = async () => {
    const ok = await handleAddToCart();
    if (ok) navigate("/cart");
  };

  const handleDecrease = async () => {
    if (!product?.id) return;
    const tok = localStorage.getItem("access_token");
    if (!tok) return toast.error("Please log in to update cart.");
    try {
      const line = await fetchCartAndFindLine(tok, product.id);
      const current = Number(line?.quantity || 0);
      if (!line || current <= 0) return syncLocalQty(product.id, 0);

      if (current > 1) {
        const newQty = current - 1;
        await axios.put(
          API.CART_ITEM(line.id),
          { quantity: newQty },
          {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${tok}`,
            },
          }
        );
        syncLocalQty(product.id, newQty);
        fetchCartCount(); // Refresh global cart count
      } else {
        await axios.delete(API.CART_ITEM(line.id), {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${tok}`,
          },
        });
        syncLocalQty(product.id, 0);
        fetchCartCount(); // Refresh global cart count
      }
    } catch (e) {
      toast.error(
        e?.response?.data?.message || e.message || "Failed to update cart"
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FF] flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#273E8E] mb-4"></div>
          <div className="text-gray-600 font-medium">Loading product...</div>
        </div>
      </div>
    );
  }
  if (err || !product) {
    return (
      <div className="min-h-screen bg-[#F5F7FF] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{err || "Product not found."}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-full bg-[#273e8e] text-white"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const average = avgRating(reviews);
  const totalReviews = reviews.length;
  const categoryName = catMap[product.categoryId] || "Solar Inverter";
  const hasDescription = Boolean(product?.description);
  const hasSpecifications = Array.isArray(product?.specifications) && product.specifications.length > 0;
  const hasLegacyDetails = Array.isArray(product?.details) && product.details.length > 0;
  const hasDetailsContent = hasDescription || hasLegacyDetails;

  /* ---------------- UI ---------------- */

  return (
    <>
      {/* ───────── Desktop (unchanged) ───────── */}
      <div className="sm:flex hidden  min-h-screen w-full bg-[#F5F7FF]">
        <SideBar />

        {balance && (
          <LoanPopUp
            icon={<BsExclamationTriangle color="white" size={26} />}
            text="Your loan balance is low, kindly apply for one to proceed"
            link="/"
            link2="/loan"
            link1Text="Back"
            link2Text="Appy for loan"
            imgBg="bg-[#FFA500]"
          />
        )}

        <div className="flex-1">
          <TopNavbar />

          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl sm:text-2xl font-medium">
                {categoryName}
              </h1>
              <Link
                to="/homePage"
                className="text-blue-600 hover:underline text-sm sm:text-base"
              >
                Go Back
              </Link>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left */}
              <div className="w-full lg:w-1/2">
                <div className="relative">
                  <div className="absolute top-3 left-3 z-10 pointer-events-none">
                    <ProductPromoBadges
                      size="large"
                      isRecommended={product.isRecommended}
                      isHotDeal={product.topDeal}
                    />
                  </div>
                  <ImageSwiper
                    images={
                      product.gallery?.length
                        ? product.gallery.map((img) => ({ image: img }))
                        : [{ image: product.image }]
                    }
                    productTitle={product.heading}
                    baseUrl="https://api.troosolar.com"
                  />
                </div>

                <div className="mt-6 space-y-4">
                  {isShopMode ? (
                    <button
                      onClick={handleAddToCart}
                      disabled={addingToCart || Number(product?.stockQty ?? 0) <= 0}
                      className="w-full py-4 bg-[#273e8e] text-white rounded-full text-center hover:bg-[#273e8e]/90 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {addingToCart && (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      )}
                      {Number(product?.stockQty ?? 0) <= 0
                        ? "Out of Stock"
                        : addingToCart
                          ? "Adding..."
                          : "Add To Cart"}
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={handleAddToCart}
                        disabled={addingToCart || Number(product?.stockQty ?? 0) <= 0}
                        className="py-4 border text-[#273E8E] border-[#273e8e] rounded-full hover:bg-[#273e8e]/10 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {addingToCart && (
                          <div className="w-4 h-4 border-2 border-[#273e8e] border-t-transparent rounded-full animate-spin"></div>
                        )}
                        {Number(product?.stockQty ?? 0) <= 0 ? "Out of Stock" : addingToCart ? "Adding..." : "Add To Cart"}
                      </button>
                      <button
                        onClick={handleBuyNow}
                        disabled={addingToCart || Number(product?.stockQty ?? 0) <= 0}
                        className="py-4 bg-[#273e8e] text-white rounded-full text-center hover:bg-[#273e8e]/90 transition disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Buy Now
                      </button>
                    </div>
                  )}
                  {showBnplPromo && (
                    <div className="p-4 mt-6 bg-[#FFFF0033] rounded-lg">
                      <p className="text-[#F8A91D] text-[14px] pb-5">
                        {BNPL_PROMO_COPY}
                      </p>
                      <Link
                        to="/bnpl"
                        className="bg-[#F8A91D] py-2 px-6 text-white rounded-full text-[13px] hover:bg-[#E09618]/90 transition inline-block"
                      >
                        Apply
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Right */}
              <div className="w-full lg:w-1/2">
                <div className="border-2 border-[#273e8e] bg-white p-4 rounded-xl">
                  <h1 className="text-lg sm:text-xl font-medium">
                    {product.heading}
                  </h1>
                  <div className="mt-2">
                    <ProductPromoBadges
                      layout="row"
                      size="large"
                      isRecommended={product.isRecommended}
                      isHotDeal={product.topDeal}
                    />
                  </div>

                  <div className="mt-3">
                    <h2 className="text-xl sm:text-2xl text-[#273e8e] font-bold">
                      {product.price}
                    </h2>

                    <div className="flex items-center gap-2 mt-1">
                      {product.oldPrice && (
                        <p className="text-gray-400 line-through text-sm">
                          {product.oldPrice}
                        </p>
                      )}
                      {product.discount && (
                        <span className="px-2 py-1 rounded-full text-orange-500 text-xs bg-orange-100">
                          {product.discount}
                        </span>
                      )}
                    </div>

                    <div className="flex justify-between items-center mt-3">
                      <div className="flex items-center">
                        <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500"
                            style={{ width: `${product.stockPct}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 ml-2">
                          {product.stockText}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Stars value={average} size={18} />
                        <span className="text-xs text-gray-500">
                          {totalReviews ? `${totalReviews}` : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 mb-8 bg-white border-1 border-[#acacad] rounded-full w-full sm:w-[65%] md:w-[55%] lg:w-[75%] xl:w-[60%] h-[57px] flex py-1 px-1">
                  {[
                    { id: "details", label: "Details" },
                    { id: "specifications", label: "Specifications" },
                    { id: "reviews", label: "Reviews" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 h-[45px] rounded-[100px] text-xs sm:text-sm ${
                        activeTab === tab.id
                          ? "bg-[#273e8e] text-white"
                          : "text-gray-500"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <h2 className="text-md font-medium mt-4 text-gray-800">
                  {activeTab === "details"
                    ? "Product Details"
                    : activeTab === "specifications"
                    ? "Specifications"
                    : "Reviews"}
                </h2>

                <div className="mt-4">
                  {activeTab === "details" ? (
                    <div className="border border-[#ccc] bg-white p-4 rounded-xl space-y-3">
                      {hasDescription && (
                        <>
                          <h3 className="text-sm font-semibold text-gray-800">Description</h3>
                          <p className="text-sm sm:text-base text-gray-700 whitespace-pre-wrap">
                            {product.description}
                          </p>
                        </>
                      )}

                      {hasLegacyDetails && (
                        <>
                          {hasDescription && <hr className="border-gray-200" />}
                          <h3 className="text-sm font-semibold text-gray-800">Additional Details</h3>
                          {product.details.map((txt, i, arr) => (
                            <React.Fragment key={`detail-${i}`}>
                              <div className="flex items-center gap-3">
                                <img
                                  src={assets.light}
                                  className="h-5 w-5"
                                  alt="Feature"
                                />
                                <p className="text-sm sm:text-base">{txt}</p>
                              </div>
                              {i < arr.length - 1 && (
                                <hr className="border-gray-200" />
                              )}
                            </React.Fragment>
                          ))}
                        </>
                      )}

                      {!hasDetailsContent && (
                        <p className="text-sm text-gray-500">No product details available.</p>
                      )}
                    </div>
                  ) : activeTab === "specifications" ? (
                    <div className="border border-[#ccc] bg-white p-4 rounded-xl space-y-3">
                      {hasSpecifications ? (
                        <>
                          {product.specifications.map((txt, i, arr) => (
                            <React.Fragment key={`spec-tab-${i}`}>
                              <div className="flex items-center gap-3">
                                <img src={assets.light} className="h-5 w-5" alt="Specification" />
                                <p className="text-sm sm:text-base">{txt}</p>
                              </div>
                              {i < arr.length - 1 && <hr className="border-gray-200" />}
                            </React.Fragment>
                          ))}
                        </>
                      ) : (
                        <p className="text-sm text-gray-500">No specifications available.</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="rounded-2xl border border-gray-300 bg-white p-4">
                        <Stars value={average} size={28} />
                        <div className="flex justify-between items-center mt-2 text-sm text-gray-800">
                          <span>
                            {Number.isFinite(average)
                              ? average.toFixed(1)
                              : "0.0"}
                          </span>
                          <span>{totalReviews} Reviews</span>
                        </div>
                        <p className="mt-3 text-xs text-gray-500">
                          Want to leave a review? Complete an order first, then open that order in{" "}
                          <Link to="/more?section=orders" className="text-[#273e8e] underline">
                            More &gt; Orders
                          </Link>.
                        </p>
                      </div>

                      <div className="rounded-2xl border border-gray-300 bg-white">
                        {reviews.length ? (
                          reviews.map((r, idx) => (
                            <div
                              key={
                                r.id || `${r.user_id}-${r.created_at}-${idx}`
                              }
                              className="p-4"
                            >
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                  <div className="h-12 w-12 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-medium">
                                    {initials(r.name)}
                                  </div>
                                  <div>
                                    <p className="font-medium text-gray-900">
                                      {r.name || "User"}
                                    </p>
                                    <div className="mt-0.5">
                                      <Stars
                                        value={toNum(r.rating, 0)}
                                        size={16}
                                      />
                                    </div>
                                  </div>
                                </div>
                                <span className="text-xs text-gray-500">
                                  {fmtDate(r.created_at)}
                                </span>
                              </div>
                              <p className="mt-3 text-sm sm:text-base text-gray-800">
                                {r.review}
                              </p>
                              {r.admin_reply ? (
                                <div className="mt-3 rounded-xl border border-[#273e8e]/25 bg-[#f5f7ff] p-3 sm:p-4">
                                  <p className="text-xs font-semibold text-[#273e8e] mb-1">
                                    Troosolar
                                  </p>
                                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                                    {r.admin_reply}
                                  </p>
                                  {r.admin_replied_at ? (
                                    <p className="text-xs text-gray-500 mt-2">
                                      {fmtDate(r.admin_replied_at)}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}
                              {idx < reviews.length - 1 && (
                                <div className="h-px bg-gray-200 mt-4 mx-2" />
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="p-6 text-sm text-gray-500">
                            No reviews yet.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* <div className="h-[70px] p-4 border bg-white border-[#ccc] mt-4 rounded-2xl flex justify-between items-center">
                  Quantity
                  <div className="flex gap-4 items-center">
                    <button
                      onClick={handleDecrease}
                      className="h-10 flex justify-center items-center w-10 bg-[#273e8e] rounded-md text-white"
                    >
                      <Minus size={20} color="white" />
                    </button>
                    <div className="px-7">{qtyInCart}</div>
                    <button
                      onClick={handleAddToCart}
                      className="h-10 flex justify-center items-center w-10 bg-[#273e8e] rounded-md text-white"
                    >
                      <Plus size={20} color="white" />
                    </button>
                  </div>
                </div> */}
              </div>
              {/* /Right */}
            </div>
          </div>
        </div>
      </div>

      {/* ───────── Mobile (updated) ───────── */}
      <div className="sm:hidden flex min-h-screen w-full bg-[#F5F7FF]">
        {balance && (
          <LoanPopUp
            icon={<BsExclamationTriangle color="white" size={26} />}
            text="Your loan balance is low, kindly apply for one to proceed"
            link="/"
            link2="/loan"
            link1Text="Back"
            link2Text="Appy for loan"
            imgBg="bg-[#FFA500]"
          />
        )}

        <div className="flex-1">
          {/* Blue header with chevron + title + cart */}
          <div className="relative">
            <div className=" h-20 rounded-b-2xl mt-[10px]" />
            <button
              onClick={() => navigate(-1)}
              className="absolute top-4 left-4 h-9 w-9 rounded-full bg-white/15 flex items-center justify-center"
              aria-label="Back"
            >
              <ChevronLeft color="black" />
            </button>
            <p className="absolute top-4 left-1/2 -translate-x-1/2 text-black text-sm mt-[10px]">
              {categoryName}
            </p>
            <Link
              to="/cart"
              className="absolute top-4 right-4 h-9 w-9 rounded-lg bg-[#fff] border border-white/10 flex items-center justify-center"
              aria-label="Cart"
            >
              <ShoppingCart color="black" size={18} />
            </Link>
          </div>

          {/* Image */}
          <div className="-mt-3 px-4 ">
            <ImageSwiper
              images={
                product.gallery?.length
                  ? product.gallery.map((img) => ({ image: img }))
                  : [{ image: product.image }]
              }
              productTitle={product.heading}
              baseUrl="https://api.troosolar.com"
            />
          </div>

          {/* Product summary card */}
          <div className="px-4 mt-4">
            <div className="border-2 border-[#273e8e] bg-white p-4 rounded-xl">
              <h1 className="text-base font-medium">{product.heading}</h1>
              <div className="mt-2">
                <ProductPromoBadges
                  layout="row"
                  size="large"
                  isRecommended={product.isRecommended}
                  isHotDeal={product.topDeal}
                />
              </div>

              <div className="mt-2 flex items-start justify-between">
                <div>
                  <p className="text-[#273e8e] font-bold text-xl">
                    {product.price}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {product.oldPrice && (
                      <p className="text-gray-400 line-through text-xs">
                        {product.oldPrice}
                      </p>
                    )}
                    {product.discount && (
                      <span className="px-2 py-0.5 rounded-full text-orange-500 text-[10px] bg-orange-100">
                        {product.discount}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Stars value={average} size={16} />
                  {totalReviews ? (
                    <span className="text-xs text-gray-500">
                      ({totalReviews})
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-start gap-1 text-[12px] text-gray-600">
                <img className="h-4 w-4" src={assets.solarProject} alt="" />
                <span>{categoryName}</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="px-4">
            <div className="bg-white border mt-4 rounded-full w-full flex py-1 px-1">
              {[
                { id: "details", label: "Details" },
                { id: "specifications", label: "Specifications" },
                { id: "reviews", label: "Reviews" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2 rounded-full text-sm ${
                    activeTab === tab.id
                      ? "bg-[#273e8e] text-white"
                      : "text-gray-500"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="mt-4">
              {activeTab === "details" ? (
                <div className="border border-[#ccc] bg-white p-4 rounded-xl space-y-3">
                  {hasDescription && (
                    <>
                      <h3 className="text-sm font-semibold text-gray-800">Description</h3>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{product.description}</p>
                    </>
                  )}

                  {hasLegacyDetails && (
                    <>
                      {hasDescription && <hr className="border-gray-200" />}
                      <h3 className="text-sm font-semibold text-gray-800">Additional Details</h3>
                      {product.details.map((txt, i, arr) => (
                        <React.Fragment key={`m-detail-${i}`}>
                          <div className="flex items-center gap-3">
                            <img
                              src={assets.light}
                              className="h-5 w-5"
                              alt="Feature"
                            />
                            <p className="text-sm">{txt}</p>
                          </div>
                          {i < arr.length - 1 && <hr className="border-gray-200" />}
                        </React.Fragment>
                      ))}
                    </>
                  )}

                  {!hasDetailsContent && (
                    <p className="text-sm text-gray-500">No product details available.</p>
                  )}
                </div>
              ) : activeTab === "specifications" ? (
                <div className="border border-[#ccc] bg-white p-4 rounded-xl space-y-3">
                  {hasSpecifications ? (
                    <>
                      {product.specifications.map((txt, i, arr) => (
                        <React.Fragment key={`m-spec-tab-${i}`}>
                          <div className="flex items-center gap-3">
                            <img src={assets.light} className="h-5 w-5" alt="Specification" />
                            <p className="text-sm">{txt}</p>
                          </div>
                          {i < arr.length - 1 && <hr className="border-gray-200" />}
                        </React.Fragment>
                      ))}
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">No specifications available.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-gray-300 bg-white p-4">
                    <Stars value={average} size={24} />
                    <div className="flex justify-between items-center mt-2 text-sm text-gray-800">
                      <span>
                        {Number.isFinite(average) ? average.toFixed(1) : "0.0"}
                      </span>
                      <span>{totalReviews} Reviews</span>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                      To leave a review, complete an order and open it in{" "}
                      <Link to="/more?section=orders" className="text-[#273e8e] underline">
                        More &gt; Orders
                      </Link>.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-300 bg-white">
                    {reviews.length ? (
                      reviews.map((r, idx) => (
                        <div
                          key={r.id || `${r.user_id}-${r.created_at}-${idx}`}
                          className="p-4"
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className="h-12 w-12 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-medium">
                                {initials(r.name)}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">
                                  {r.name || "User"}
                                </p>
                                <div className="mt-0.5">
                                  <Stars value={toNum(r.rating, 0)} size={16} />
                                </div>
                              </div>
                            </div>
                            <span className="text-xs text-gray-500">
                              {fmtDate(r.created_at)}
                            </span>
                          </div>
                          <p className="mt-3 text-sm text-gray-800">
                            {r.review}
                          </p>
                          {r.admin_reply ? (
                            <div className="mt-3 rounded-xl border border-[#273e8e]/25 bg-[#f5f7ff] p-3">
                              <p className="text-xs font-semibold text-[#273e8e] mb-1">
                                Troosolar
                              </p>
                              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                                {r.admin_reply}
                              </p>
                              {r.admin_replied_at ? (
                                <p className="text-xs text-gray-500 mt-2">
                                  {fmtDate(r.admin_replied_at)}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {idx < reviews.length - 1 && (
                            <div className="h-px bg-gray-200 mt-4 mx-2" />
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-sm text-gray-500">
                        No reviews yet.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Quantity */}
            <div className="h-[70px] p-4 border mt-4 rounded-2xl flex justify-between items-center bg-white">
              Quantity
              <div className="flex gap-4 items-center">
                <button
                  onClick={handleDecrease}
                  className="h-10 flex justify-center items-center w-10 bg-[#273e8e] rounded-md text-white"
                >
                  <Minus size={20} color="white" />
                </button>
                {qtyInCart}
                <button
                  onClick={handleAddToCart}
                  disabled={addingToCart || Number(product?.stockQty ?? 0) <= 0}
                  className="h-10 flex justify-center items-center w-10 bg-[#273e8e] rounded-md text-white disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {addingToCart ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Plus size={20} color="white" />
                  )}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 space-y-4 pb-8">
              {isShopMode ? (
                <button
                  onClick={handleAddToCart}
                  disabled={addingToCart || Number(product?.stockQty ?? 0) <= 0}
                  className="w-full py-3 bg-[#273e8e] text-white rounded-full text-center hover:bg-[#273e8e]/90 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {addingToCart && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  )}
                  {Number(product?.stockQty ?? 0) <= 0
                    ? "Out of Stock"
                    : addingToCart
                      ? "Adding..."
                      : "Add To Cart"}
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={handleAddToCart}
                    disabled={addingToCart || Number(product?.stockQty ?? 0) <= 0}
                    className="py-3 border border-[#273e8e] rounded-full hover:bg-[#273e8e]/10 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {addingToCart && (
                      <div className="w-4 h-4 border-2 border-[#273e8e] border-t-transparent rounded-full animate-spin"></div>
                    )}
                    {Number(product?.stockQty ?? 0) <= 0 ? "Out of Stock" : addingToCart ? "Adding..." : "Add To Cart"}
                  </button>
                  <button
                    onClick={handleBuyNow}
                    disabled={addingToCart || Number(product?.stockQty ?? 0) <= 0}
                    className="py-3 bg-[#273e8e] text-white rounded-full text-center hover:bg-[#273e8e]/90 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Buy Now
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
