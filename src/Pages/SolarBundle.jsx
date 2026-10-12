import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link, useLocation, useNavigate } from "react-router-dom";
import SideBar from "../Component/SideBar";
import TopNavbar from "../Component/TopNavbar";
import SearchBar from "../Component/SearchBar";
import SolarBundleComponent from "../Component/SolarBundleComponent";
import API, { BASE_URL } from "../config/api.config";
import { assets } from "../assets/data";
import {
  extractKvaFromBundle,
  sortBundlesFeaturedThenKvaAsc,
  sortMappedBundleCards,
  entityTopDeal,
  entityHighlyRecommended,
} from "../utils/bundleSort";
import { ChevronLeft, ChevronRight, Edit } from "lucide-react";
import Loading from "../Component/Loading";

// --- utils -------------------------------------------------------------

// turn BASE_URL (http://localhost:8000/api) into API origin (http://localhost:8000)
const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, "");

// format ₦ nicely
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
  if (/^https?:\/\//i.test(path)) return path; // already absolute
  if (path.startsWith("/")) return `${API_ORIGIN}${path}`; // "/storage/xyz.jpg"
  // "bundles/xyz.jpg" or "public/bundles/xyz.jpg"
  const cleaned = path.replace(/^public\//, "");
  return `${API_ORIGIN}/storage/${cleaned}`;
};

// Fallback image URL
const FALLBACK_IMAGE = "https://api.troosolar.com/storage/products/d5c7f116-57ed-46ef-a659-337c94c308a9.png";

// map API bundle -> card props
const mapBundle = (b) => {
  const image = b?.featured_image
    ? toAbsolute(b.featured_image)
    : FALLBACK_IMAGE;

  const title = b?.title || `Bundle #${b?.id ?? ""}`;
  const total = Number(b?.total_price ?? 0);
  const discount = Number(b?.discount_price ?? 0);
  const showDiscount = discount > 0 && discount < total;

  const price = formatNGN(showDiscount ? discount : total);
  const oldPrice = showDiscount ? formatNGN(total) : "";
  const pct = showDiscount && total > 0 ? Math.round((1 - discount / total) * 100) : 0;
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
    inverterRating: b?.inver_rating ?? b?.inverter_rating ?? b?.inverterRating ?? "",
    borderColor: "#273e8e", // theme color frame
    isHotDeal: entityTopDeal(b),
    isRecommended: entityHighlyRecommended(b),
  };
};

// normalize API response to an array
const normalizeBundles = (data) => {
  const root = data?.data ?? data;
  if (Array.isArray(root)) return root;              // /api/bundles (all)
  if (Array.isArray(root?.data)) return root.data;   // alt shape
  if (root && typeof root === "object") return [root]; // /api/bundles?q=... (single)
  return [];
};

// ----------------------------------------------------------------------

const SolarBundle = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const qParam = searchParams.get("q")?.trim();
  const kvaParam = searchParams.get("kva")?.trim();

  const [rawBundles, setRawBundles] = useState([]); // API response before mapBundle
  const [displayBundles, setDisplayBundles] = useState([]); // what we show (all or filtered)
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [selectedBundleType, setSelectedBundleType] = useState("all");
  const [selectedSystemSize, setSelectedSystemSize] = useState("all");
  const [priceSort, setPriceSort] = useState("default");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12);

  useEffect(() => {
    const fetchBundles = async () => {
      setLoading(true);
      setErr("");
      try {
        const token = localStorage.getItem("access_token");

        const url = (() => {
          if (qParam && !Number.isNaN(Number(qParam))) {
            const qp = new URLSearchParams({ q: String(qParam) });
            if (kvaParam) {
              qp.set("kva", String(kvaParam));
            }
            return `${API.BUNDLES}?${qp.toString()}`;
          }
          return API.BUNDLES;
        })();

        const { data } = await axios.get(url, {
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        const arr = normalizeBundles(data);
        // Defensive: hide unavailable / empty shells and dedupe (catalog should match admin visibility).
        const seen = new Set();
        const cleaned = arr.filter((b) => {
          const id = b?.id;
          if (id != null) {
            if (seen.has(id)) return false;
            seen.add(id);
          }
          if (b?.is_available === false) return false;
          if (!String(b?.title || "").trim()) return false;
          if (!(Number(b?.total_price) > 0)) return false;
          return true;
        });
        setRawBundles(cleaned);
      } catch (e) {
        setErr(
          e?.response?.data?.message || e?.message || "Failed to load bundles."
        );
        setRawBundles([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBundles();
  }, [qParam, kvaParam]);

  // Filter/sort display bundles
  useEffect(() => {
    let list = rawBundles.filter((b) => {
      const bundleType = String(b?.bundle_type || "").trim();
      const inverterRating = extractKvaFromBundle(b);

      const typeMatch =
        selectedBundleType === "all" ||
        bundleType.toLowerCase() === selectedBundleType.toLowerCase();

      const eps = 1e-6;
      const sizeMatch =
        selectedSystemSize === "all" ||
        (selectedSystemSize === "small" && inverterRating > 0 && inverterRating < 2 - eps) ||
        (selectedSystemSize === "medium" && inverterRating >= 2 - eps && inverterRating <= 6.5 + eps) ||
        (selectedSystemSize === "large" && inverterRating >= 6.5 - eps);

      return typeMatch && sizeMatch;
    });

    if (priceSort !== "default") {
      list = [...list].sort((a, b) => {
        const aPrice = Number(a?.discount_price || a?.total_price || 0);
        const bPrice = Number(b?.discount_price || b?.total_price || 0);
        return priceSort === "low-high" ? aPrice - bPrice : bPrice - aPrice;
      });
    } else {
      // Default: Top Deal / Highly Recommended first, then ascending kVA.
      list = sortBundlesFeaturedThenKvaAsc(list);
    }

    setDisplayBundles(list.map(mapBundle));
  }, [rawBundles, selectedBundleType, selectedSystemSize, priceSort]);

  // Reset to first page when major filters/data source change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBundleType, selectedSystemSize, priceSort, qParam, kvaParam]);

  // Products for SearchBar: each item has mapBundle fields + raw bundle for size filter
  const searchBarProducts = useMemo(
    () => rawBundles.map((r) => ({ ...mapBundle(r), bundle: r })),
    [rawBundles]
  );

  const bundleTypeOptions = useMemo(() => {
    const types = Array.from(
      new Set(
        rawBundles
          .map((b) => String(b?.bundle_type || "").trim())
          .filter(Boolean)
      )
    );
    return types;
  }, [rawBundles]);

  const totalItems = displayBundles.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedBundles = displayBundles.slice(startIndex, endIndex);

  // Clamp current page when result count changes (e.g. after search/filter)
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex w-full min-h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-auto">
        <SideBar />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <TopNavbar />

        {/* Header and Search */}
        <div className="bg-[#273e8e] border-l-2 border-gray-500 px-6 py-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="min-w-[180px]">
              <h1 className="text-md font-semibold text-white">Solar Bundles</h1>
              <p className="text-white text-xs">
                {qParam
                  ? "Choose from recommended bundles based on your load calculation"
                  : "Welcome to the dashboard"}
              </p>
            </div>
            {!qParam && (
              <SearchBar
                categories={[]}
                products={searchBarProducts}
                onFilteredResults={(results) => {
                  setDisplayBundles(sortMappedBundleCards(results));
                  setCurrentPage(1);
                }}
              />
            )}
          </div>
          {qParam && (
            <div className="mt-4">
              <button
                onClick={() => navigate("/tools?inverter=true&fromBundles=true&q=" + qParam)}
                className="flex items-center gap-2 text-white hover:text-gray-200 transition-colors text-sm font-medium"
              >
                <Edit size={16} />
                <span>Edit Load</span>
              </button>
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="px-6 py-4 w-full overflow-scroll">
          <h1 className="text-2xl font-semibold text-gray-800 mb-4">
            {qParam ? "Choose from Recommended Bundle(s)" : "All Bundles"}
          </h1>

          <div className="relative z-[100] flex justify-start items-center gap-4 mb-4 flex-wrap">
            <div className="w-full max-w-[220px]">
              <select
                value={selectedBundleType}
                onChange={(e) => setSelectedBundleType(e.target.value)}
                className="w-full px-4 py-4 bg-white border border-black/50 rounded-2xl shadow-sm hover:border-black/70 transition-colors text-sm lg:text-base text-gray-500"
              >
                <option value="all">All Types</option>
                {bundleTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full max-w-[220px]">
              <select
                value={selectedSystemSize}
                onChange={(e) => setSelectedSystemSize(e.target.value)}
                className="w-full px-4 py-4 bg-white border border-black/50 rounded-2xl shadow-sm hover:border-black/70 transition-colors text-sm lg:text-base text-gray-500"
              >
                <option value="all">All Sizes</option>
                <option value="small">Small (&lt; 2kVA)</option>
                <option value="medium">Medium (2-6.5kVA)</option>
                <option value="large">Large (6.5kVA+)</option>
              </select>
            </div>

            <div className="w-full max-w-[220px]">
              <select
                value={priceSort}
                onChange={(e) => setPriceSort(e.target.value)}
                className="w-full px-4 py-4 bg-white border border-black/50 rounded-2xl shadow-sm hover:border-black/70 transition-colors text-sm lg:text-base text-gray-500"
              >
                <option value="default">Price</option>
                <option value="low-high">Price: Low to High</option>
                <option value="high-low">Price: High to Low</option>
              </select>
            </div>

            <button
              onClick={() => {
                setSelectedBundleType("all");
                setSelectedSystemSize("all");
                setPriceSort("default");
              }}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Clear Filters
            </button>
          </div>

          {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
          {loading && (
            <div className="flex justify-center items-center py-12">
              <Loading message="Loading bundles..." progress={null} />
            </div>
          )}

          <div className="grid xl:grid-cols-4 lg:grid-cols-4 md:grid-cols-2 grid-cols-1 gap-3">
            {paginatedBundles.map((item) => (
              <SolarBundleComponent
                key={item.id}
                id={item.id}
                image={item.image}
                heading={item.heading}
                price={item.price}
                oldPrice={item.oldPrice}
                discount={item.discount}
                borderColor={item.borderColor}
                rating={item.rating}
                bundleTitle={item.bundleTitle}
                inverterRating={item.inverterRating}
                isHotDeal={item.isHotDeal}
                isRecommended={item.isRecommended}
              />
            ))}

            {!loading && !err && displayBundles.length === 0 && (
              <div className="text-gray-500 bg-white border rounded-xl p-4">
                {qParam
                  ? "No matching bundle found for that target."
                  : "No bundles found."}
              </div>
            )}
          </div>

          {/* Pagination */}
          {!loading && !err && totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-8">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === pageNum
                          ? "bg-[#273e8e] text-white"
                          : "border border-gray-300 hover:bg-gray-50 text-gray-700"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
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

          {/* Results Info */}
          {!loading && !err && totalItems > 0 && (
            <div className="text-center text-sm text-gray-500 mt-4">
              Showing {startIndex + 1} - {Math.min(endIndex, totalItems)} of {totalItems} bundles
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SolarBundle;
