import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { assets } from "../assets/data";
import LoanWallet from "../Component/LoanWallet";
import SmallBoxes from "../Component/SmallBoxes";
import ShoppingWallet from "../Component/ShoppingWallet";
import SideBar from "../Component/SideBar";
import TopNavbar from "../Component/TopNavbar";
import { Bell } from "lucide-react";
import Product from "../Component/Product";
import { Link } from "react-router-dom";
import SolarBundleComponent from "../Component/SolarBundleComponent";
import ServiceCards from "../Component/ServiceCards";
import HrLine from "../Component/MobileSectionResponsive/HrLine";
import API, { BASE_URL } from "../config/api.config";
import Loading from "../Component/Loading";
import { getSiteBanners } from "../utils/siteBanners";
import { apiFlagTrue } from "../utils/apiFlags";
import { withShopSource } from "../utils/shopSource";

/* ---------------- helpers ---------------- */

// origin from BASE_URL
const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, "");

// ₦ formatter
const formatNGN = (n) => {
  const num =
    typeof n === "number"
      ? n
      : Number(String(n ?? "").replace(/[^\d.]/g, "")) || 0;
  try {
    return `₦${new Intl.NumberFormat("en-NG").format(num)}`;
  } catch {
    return `₦${num}`;
  }
};

// convert storage paths to absolute URLs
const toAbsolute = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${API_ORIGIN}${path}`;
  const cleaned = path.replace(/^public\//, "");
  return `${API_ORIGIN}/storage/${cleaned}`;
};

// map API product -> Product card props
const mapApiProductToCard = (p) => {
  const image =
    toAbsolute(p?.featured_image_url || p?.featured_image) ||
    toAbsolute(p?.images?.[0]?.image) ||
    assets?.placeholderProduct ||
    "/placeholder-product.png";

  const heading = p?.title || p?.name || `Product #${p?.id ?? ""}`;

  const priceRaw = Number(p?.price ?? 0);
  const discountRaw =
    p?.discount_price != null ? Number(p.discount_price) : null;

  let isDiscountActive = false;
  if (discountRaw != null && discountRaw > 0 && discountRaw < priceRaw) {
    isDiscountActive = p?.discount_end_date
      ? new Date(p.discount_end_date) > new Date()
      : true;
  }

  const effectiveRaw = isDiscountActive ? discountRaw : priceRaw;
  const oldRaw = isDiscountActive ? priceRaw : null;

  const price = formatNGN(effectiveRaw);
  const oldPrice = oldRaw != null ? formatNGN(oldRaw) : "";

  let discount = "";
  if (isDiscountActive && priceRaw > 0) {
    const pct = Math.round(((priceRaw - discountRaw) / priceRaw) * 100);
    discount = `-${pct}%`;
  }

  const reviews = Array.isArray(p?.reviews) ? p.reviews : [];
  const ratingAvg =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + Number(r?.rating ?? 0), 0) / reviews.length
      : 0;

  return {
    id: p?.id,
    image,
    heading,
    price,
    oldPrice,
    discount,
    ratingAvg,
    ratingCount: reviews.length,
    categoryId: p?.category_id,
    isHotDeal: apiFlagTrue(p?.top_deal),
    isRecommended: apiFlagTrue(p?.is_most_popular),
  };
};

// map API bundle -> card props (unchanged)
const mapBundle = (b) => {
  const image = b?.featured_image
    ? toAbsolute(b.featured_image)
    : assets?.placeholderProduct || "/placeholder-product.png";

  const title = b?.title || `Bundle #${b?.id ?? ""}`;
  const total = Number(b?.total_price ?? 0);
  const discount = Number(b?.discount_price ?? 0);
  const showDiscount = discount > 0 && discount < total;

  const price = formatNGN(showDiscount ? discount : total);
  const oldPrice = showDiscount ? formatNGN(total) : "";
  const pct = showDiscount ? Math.round((1 - discount / total) * 100) : 0;
  const badge = showDiscount ? `-${pct}%` : "";

  return {
    id: b?.id,
    image,
    heading: title,
    price,
    oldPrice,
    discount: badge,
    rating: assets?.fiveStars || assets?.rating || "",
    bundleTitle: b?.bundle_type || "",
    borderColor: "#273e8e",
    isHotDeal: apiFlagTrue(b?.top_deal),
    isRecommended: apiFlagTrue(b?.is_most_popular),
  };
};

// read a stored user (unchanged)
const CANDIDATE_KEYS = [
  "user",
  "auth_user",
  "current_user",
  "profile",
  "logged_in_user",
  "loggedInUser",
];
const readStoredUser = () => {
  for (const k of CANDIDATE_KEYS) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") return obj;
    } catch { }
  }
  return null;
};
const getDisplayName = (u) =>
  (
    u?.full_name ||
    u?.name ||
    [u?.first_name, u?.last_name].filter(Boolean).join(" ") ||
    ""
  ).trim();
const getFirstName = (u) => {
  if (!u) return "";
  if (u.first_name) return String(u.first_name);
  const name = getDisplayName(u);
  return name.split(/\s+/)[0] || "";
};

const getAvatarUrl = (u) => {
  if (!u) return "";

  const avatarUrl = (
    u.avatar ||
    u.profile_picture ||
    u.photo ||
    u.image_url ||
    u.avatar_url ||
    ""
  );

  // Check if the URL contains "null" (indicating no actual image)
  if (avatarUrl && avatarUrl.includes("null")) {
    return "";
  }

  return avatarUrl;
};

const getInitials = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "U";
};

/* ---------------- component ---------------- */

const Home = () => {
  const [showWallet, setShowWallet] = useState(true);
  const [user, setUser] = useState(null);

  // bundles
  const [bundles, setBundles] = useState([]);
  const [bundlesLoading, setBundlesLoading] = useState(false);
  const [bundlesErr, setBundlesErr] = useState("");

  // products (new)
  const [categories, setCategories] = useState([]);
  const [apiProducts, setApiProducts] = useState([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodError, setProdError] = useState("");
  
  // active loan check
  const [hasActiveLoan, setHasActiveLoan] = useState(false);

  // home promo banner (from API)
  const [bannerUrl, setBannerUrl] = useState(null);

  useEffect(() => {
    setUser(readStoredUser());
  }, []);

  // Check for active loans
  useEffect(() => {
    const checkActiveLoans = async () => {
      try {
        const token = localStorage.getItem("access_token");
        if (!token) {
          setHasActiveLoan(false);
          return;
        }

        // Check for active BNPL applications/orders
        const [ordersRes, appsRes] = await Promise.allSettled([
          axios.get(API.BNPL_ORDERS, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            params: { per_page: 1, page: 1 },
          }),
          axios.get(API.BNPL_APPLICATIONS, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            params: { per_page: 1, page: 1 },
          }),
        ]);

        let hasActive = false;

        // Check orders
        if (ordersRes.status === "fulfilled" && ordersRes.value.data?.status === "success") {
          const orders = ordersRes.value.data.data?.data || ordersRes.value.data.data || [];
          hasActive = orders.some((order) => {
            const status = order.order_status || order.status;
            const loanApp = order.loan_application;
            // Active if: approved and has repayment schedule, or has pending installments
            return (
              (status === "approved" || loanApp?.status === "approved") &&
              (order.repayment_schedule?.length > 0 || order.loan_summary?.pending_installments > 0)
            );
          });
        }

        // Check applications if no active orders found
        if (!hasActive && appsRes.status === "fulfilled" && appsRes.value.data?.status === "success") {
          const apps = appsRes.value.data.data?.data || appsRes.value.data.data || [];
          hasActive = apps.some((app) => {
            const status = app.status?.toLowerCase();
            // Active if: approved (with or without down payment), or counter_offer
            return (
              status === "approved" ||
              status === "counter_offer" ||
              (status === "pending" && app.down_payment_completed)
            );
          });
        }

        setHasActiveLoan(hasActive);
      } catch (error) {
        console.log("Error checking active loans:", error);
        setHasActiveLoan(false);
      }
    };

    checkActiveLoans();
  }, []);

  // fetch bundles
  useEffect(() => {
    const fetchBundles = async () => {
      setBundlesLoading(true);
      setBundlesErr("");
      try {
        const token = localStorage.getItem("access_token");
        const { data } = await axios.get(API.BUNDLES, {
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const root = data?.data ?? data;
        const arr = Array.isArray(root)
          ? root
          : Array.isArray(root?.data)
            ? root.data
            : [];
        setBundles(arr.map(mapBundle));
      } catch (e) {
        setBundlesErr(
          e?.response?.data?.message || e?.message || "Failed to load bundles."
        );
        setBundles([]);
      } finally {
        setBundlesLoading(false);
      }
    };
    fetchBundles();
  }, []);

  // fetch categories + products (same as HomePage)
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem("access_token");
        const catRes = await axios.get(API.CATEGORIES, {
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const catList = Array.isArray(catRes?.data?.data)
          ? catRes.data.data
          : [];
        setCategories(catList);
      } catch { }
    })();
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      setProdLoading(true);
      setProdError("");
      try {
        const token = localStorage.getItem("access_token");
        const { data } = await axios.get(API.PRODUCTS, {
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const list = Array.isArray(data?.data) ? data.data : [];
        setApiProducts(list.map(mapApiProductToCard));
      } catch (err) {
        setProdError(
          err?.response?.data?.message ||
          err?.message ||
          "Failed to load products."
        );
      } finally {
        setProdLoading(false);
      }
    };
    fetchProducts();
  }, []);

  // Home promo banner (public API; URL resolved to API origin in utils)
  useEffect(() => {
    (async () => {
      const { homeUrl } = await getSiteBanners();
      setBannerUrl(homeUrl || null);
    })();
  }, []);

  const catMap = useMemo(() => {
    const map = {};
    for (const c of categories || []) {
      const name = c?.name || c?.title || c?.category_name || "";
      if (c?.id) map[c.id] = name || "";
    }
    return map;
  }, [categories]);

  const gridProducts = useMemo(
    () =>
      (apiProducts || []).map((p) => ({
        ...p,
        categoryName: catMap[p.categoryId] || "Inverter",
      })),
    [apiProducts, catMap]
  );

  // Combine products and bundles for featured section
  const featuredItems = useMemo(() => {
    const items = [];
    
    // Add bundles with type marker
    bundles.forEach(bundle => {
      items.push({
        ...bundle,
        type: 'bundle',
        link: withShopSource(`/productBundle/details/${bundle.id}`)
      });
    });
    
    // Add products with type marker
    gridProducts.forEach(product => {
      items.push({
        ...product,
        type: 'product',
        link: withShopSource(`/homePage/product/${product.id}`)
      });
    });
    
    // Shuffle to mix products and bundles
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    
    // Return at least 6 items (or all if less than 6 available)
    // For desktop, show up to 8-10 items for better UX
    const minItems = 6;
    const maxItems = 10;
    if (shuffled.length <= minItems) {
      return shuffled; // Return all if we have 6 or fewer
    }
    return shuffled.slice(0, Math.min(maxItems, shuffled.length)); // Show at least 6, up to maxItems
  }, [bundles, gridProducts]);

  const firstName = useMemo(() => getFirstName(user) || "there", [user]);
  const avatar = useMemo(() => getAvatarUrl(user), [user]);
  const initials = useMemo(() => getInitials(getDisplayName(user)), [user]);

  return (
    <div className="flex min-h-screen w-full">
      <SideBar />

      {/* Main Content */}
      <div className="flex-grow w-1/2">
        <div>
          {/* Topbar */}
          <div className="sm:block hidden">
            <TopNavbar />
          </div>

          <div className="bg-[#F5F7FF] p-5">
            {/* Greeting / bell */}
            <div className="flex justify-between items-center">
              <div className="flex justify-start gap-2 items-center">
                <div className="sm:hidden bg-[#e9e9e9] h-12 w-12 rounded-full overflow-hidden flex items-center justify-center">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={getDisplayName(user)}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <p className="text-[20px] text-[#909090] font-medium">
                      {initials}
                    </p>
                  )}
                </div>
                <div>
                  <h1 className="text-md lg:text-2xl">
                    Hi{" "},{" "}
                    <span className="sm:text-[#273e8e] text-black">
                      {firstName}
                    </span>
                  </h1>
                  <p className="mt-1 text-xs lg:text-base">
                    Welcome to your dashboard
                  </p>
                </div>
              </div>

              <button className="rounded-lg sm:hidden flex justify-center items-center shadow-md lg:h-10 lg:w-10 h-8 w-8 bg-white">
                <Bell size={18} lg:size={24} />
              </button>
            </div>

            {/* Service Cards (New Flow Entry Points) */}
            {/* <div className="mt-6">
              <ServiceCards hasActiveLoan={hasActiveLoan} />
            </div> */}

            {/* Wallets / banner */}
            <div className="grid items-center md:grid-cols-2 grid-cols-1 xl:grid-cols-3 gap-5 mt-4">
              <div className="flex justify-start items-center sm:hidden gap-3 pt-2">
                <button
                  onClick={() => setShowWallet(!showWallet)}
                  className={`border text-[12px] w-[30%] border-[#273e8e] py-3 rounded-full ${showWallet ? "text-white bg-[#273e8e]" : "text-black "
                    }`}
                >
                  Loan Wallet
                </button>
                <button
                  onClick={() => setShowWallet(!showWallet)}
                  className={`border text-[11px] w-[35%] border-[#273e8e] py-3 rounded-full ${showWallet ? "text-black " : "text-white bg-[#273e8e]"
                    }`}
                >
                  Shopping Wallet
                </button>
              </div>

              <div className="block sm:hidden">
                {showWallet ? <LoanWallet /> : <ShoppingWallet />}
              </div>
              <div className="sm:block hidden">
                <LoanWallet />
              </div>
              <div className="sm:block hidden">
                <ShoppingWallet />
              </div>
              {bannerUrl && (
                <img
                  src={bannerUrl}
                  className="hidden lg:block min-w-full h-[243px] rounded-lg object-cover"
                  alt="Promotion banner"
                />
              )}
            </div>

            <div className="mt-4">
              <SmallBoxes />
            </div>
            {bannerUrl && (
              <img
                src={bannerUrl}
                className="sm:hidden block my-4 w-full rounded-lg object-cover"
                alt="Promotion banner"
              />
            )}

            {/* ---------- Featured Products (Products + Bundles) ---------- */}
            <div className="mt-6">
              <h1 className="text-xl sm:block hidden font-[500]">
                Featured Products
              </h1>
              <p className="text-gray-500 pt-4 text-sm  sm:block hidden sm:text-base">
                Discover our handpicked selection of premium solar products and bundles, 
                carefully curated to meet your energy needs. Choose from complete solar systems 
                or individual components to build your perfect solution.
              </p>
              <HrLine text={"Hottest Deals"} />
            </div>

            <div className="my-4 hidden sm:flex gap-5 overflow-x-auto pb-4 scrollbar-hide">
              {(bundlesErr || prodError) && (
                <div className="text-red-600 text-sm">
                  {bundlesErr || prodError}
                </div>
              )}
              {(bundlesLoading || prodLoading) ? (
                <div className="flex justify-center items-center py-12 w-full">
                  <Loading 
                    message="Loading featured products..." 
                    progress={bundlesLoading && prodLoading ? 50 : bundlesLoading ? 30 : 70}
                  />
                </div>
              ) : !bundlesLoading &&
                !prodLoading &&
                !bundlesErr &&
                !prodError &&
                featuredItems.length > 0 ? (
                featuredItems.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex-shrink-0 w-[243px]"
                  >
                    {item.type === 'bundle' ? (
                      <SolarBundleComponent
                        id={item.id}
                        image={item.image}
                        heading={item.heading}
                        price={item.price}
                        oldPrice={item.oldPrice}
                        discount={item.discount}
                        rating={item.rating}
                        borderColor={item.borderColor}
                        bundleTitle={item.bundleTitle}
                        isHotDeal={item.isHotDeal}
                        isRecommended={item.isRecommended}
                      />
                    ) : (
                      <Link to={item.link}>
                        <Product
                          id={item.id}
                          image={item.image}
                          heading={item.heading}
                          price={item.price}
                          oldPrice={item.oldPrice}
                          discount={item.discount}
                          ratingAvg={item.ratingAvg}
                          ratingCount={item.ratingCount}
                          categoryName={item.categoryName}
                          isHotDeal={item.isHotDeal}
                          isRecommended={item.isRecommended}
                        />
                      </Link>
                    )}
                  </div>
                ))
              ) : !bundlesLoading && 
                !prodLoading && 
                !bundlesErr && 
                !prodError && 
                featuredItems.length === 0 ? (
                <div className="text-gray-500 bg-white border rounded-xl p-4">
                  No featured products found.
                </div>
              ) : null}
            </div>

            {/* ---------- Mobile Featured Products (Products + Bundles) ---------- */}
            <div className="my-4 sm:hidden">
              {(prodError || bundlesErr) && (
                <p className="text-red-600 text-sm mt-3">
                  {prodError || bundlesErr}
                </p>
              )}
              {(prodLoading || bundlesLoading) ? (
                <div className="grid grid-cols-2 gap-4 max-sm:gap-5 max-sm:ml-[-10px] max-[320px]:grid-cols-2 mt-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-full max-[380px]:w-[160px] min-sm:w-[190px] bg-white border border-gray-200 rounded-[24px] p-3 shadow-sm flex flex-col animate-pulse"
                    >
                      <div className="bg-gray-200 h-[140px] rounded-2xl mb-2" />
                      <div className="h-3 bg-gray-200 rounded mb-2" />
                      <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
                      <div className="h-2 bg-gray-200 rounded w-1/2 mt-2" />
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div className="h-7 bg-gray-200 rounded-full" />
                        <div className="h-7 bg-gray-200 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !prodLoading &&
                  !bundlesLoading &&
                  !prodError &&
                  !bundlesErr &&
                  featuredItems.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 max-sm:gap-5 max-sm:ml-[-10px] max-[320px]:grid-cols-2 items-stretch">
                  {featuredItems.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="w-full max-[380px]:w-[160px] min-sm:w-[190px] h-full flex" // keep card height consistent
                    >
                      {item.type === 'bundle' ? (
                        <SolarBundleComponent
                          id={item.id}
                          image={item.image}
                          heading={item.heading}
                          price={item.price}
                          oldPrice={item.oldPrice}
                          discount={item.discount}
                          rating={item.rating}
                          borderColor={item.borderColor}
                          bundleTitle={item.bundleTitle}
                          isHotDeal={item.isHotDeal}
                          isRecommended={item.isRecommended}
                        />
                      ) : (
                        <Link to={item.link} className="w-full h-full">
                          <Product
                            id={item.id}
                            image={item.image}
                            heading={item.heading}
                            price={item.price}
                            oldPrice={item.oldPrice}
                            discount={item.discount}
                            ratingAvg={item.ratingAvg}
                            ratingCount={item.ratingCount}
                            categoryName={item.categoryName}
                            isHotDeal={item.isHotDeal}
                            isRecommended={item.isRecommended}
                          />
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              ) : !prodLoading && 
                !bundlesLoading && 
                !prodError && 
                !bundlesErr && 
                featuredItems.length === 0 ? (
                <div className="text-gray-500 bg-white border rounded-xl p-4 mt-3">
                  No featured products found.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
