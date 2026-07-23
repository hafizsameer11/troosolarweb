import React, { useContext, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { ContextApi } from "../Context/AppContext";
import API from "../config/api.config";
import { loginPathWithReturn } from "../utils/authRedirect";
import ProductPromoBadges from "./ProductPromoBadges";
import { withShopSource } from "../utils/shopSource";

const SolarBundleComponent = ({
  id,
  image,
  heading,
  price,
  oldPrice,
  discount,
  soldText,
  progressBar,
  rating,
  borderColor,
  bundleTitle,
  inverterRating,
  isHotDeal = false,
  isRecommended = false,
}) => {
  const { fetchCartCount, showCartNotificationModal } = useContext(ContextApi);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const FALLBACK_IMAGE =
    "https://api.troosolar.com/storage/products/d5c7f116-57ed-46ef-a659-337c94c308a9.png";

  const imageUrl = useFallback ? FALLBACK_IMAGE : image || FALLBACK_IMAGE;

  const handleImageLoad = () => {
    setImageLoading(false);
  };

  const handleImageError = () => {
    if (!useFallback) {
      setUseFallback(true);
      setImageLoading(true);
    } else {
      setImageLoading(false);
      setImageError(true);
    }
  };

  const handleCardClick = (e) => {
    if (!e.target.closest("a") && !e.target.closest("button")) {
      if (id) {
        const flow = new URLSearchParams(location.search || "").get("flow");
        const detailPath = flow
          ? `/productBundle/details/${id}${location.search || ""}`
          : withShopSource(`/productBundle/details/${id}${location.search || ""}`);
        navigate(detailPath);
      }
    }
  };

  const handleAddToCart = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!id) return;

    const token = localStorage.getItem("access_token");
    if (!token) {
      navigate(loginPathWithReturn());
      return;
    }

    try {
      setErr("");
      setAdding(true);
      await axios.post(
        API.CART,
        {
          itemable_type: "bundle",
          itemable_id: Number(id),
          quantity: 1,
        },
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      fetchCartCount?.();
      showCartNotificationModal?.(heading, imageUrl);
    } catch (addErr) {
      const msg =
        addErr?.response?.data?.message ||
        addErr?.message ||
        "Failed to add to cart.";
      setErr(msg);
      if (addErr?.response?.status === 409) {
        alert(msg);
      }
    } finally {
      setAdding(false);
    }
  };

  const detailLink = (() => {
    const flow = new URLSearchParams(location.search || "").get("flow");
    const path = `/productBundle/details/${id}${location.search || ""}`;
    return flow ? path : withShopSource(path);
  })();
  const inverterRatingText = (() => {
    if (inverterRating == null || inverterRating === "") return "";
    const raw = String(inverterRating).trim();
    if (!raw) return "";
    return /kva/i.test(raw) ? raw : `${raw}kVA`;
  })();

  const cardHighlight = isRecommended
    ? "ring-2 ring-green-500/90 shadow-lg"
    : isHotDeal
      ? "ring-2 ring-amber-400/90"
      : "";

  return (
    <div
      className={`w-full h-full bg-white rounded-[20px] p-3 sm:p-3 shadow-sm flex flex-col min-h-[290px] sm:min-h-0 cursor-pointer hover:shadow-md transition-shadow ${cardHighlight}`.trim()}
      style={{
        border: `2px solid ${isRecommended ? "#16a34a" : borderColor || "#273e8e"}`,
      }}
      onClick={handleCardClick}
    >
      <div className="relative rounded-xl mb-2 overflow-hidden bg-gray-100 h-[130px] sm:h-[145px] flex items-center justify-center">
        <div className="absolute top-2 left-2 z-[11] pointer-events-none flex flex-col gap-1.5 items-start max-w-[55%]">
          <ProductPromoBadges isRecommended={isRecommended} isHotDeal={isHotDeal} />
          {inverterRatingText ? (
            <span className="bg-[#F8A91D] text-white text-[10px] sm:text-[11px] px-2 py-1 rounded-full font-semibold shadow whitespace-nowrap">
              {inverterRatingText}
            </span>
          ) : null}
        </div>
        {imageLoading && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273E8E]"></div>
          </div>
        )}

        {imageError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center text-gray-400">
              <p className="text-xs">Image unavailable</p>
            </div>
          </div>
        )}

        <img
          src={imageUrl}
          alt={heading || "Solar bundle product"}
          className={`w-full h-full object-contain transition-opacity duration-300 ${
            imageLoading ? "opacity-0" : "opacity-100"
          }`}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      </div>

      <div className="min-h-[48px] mb-2">
        <h2 className="text-[13px] sm:text-[14px] font-medium text-slate-800 leading-snug line-clamp-2">
          {heading}
        </h2>
        {bundleTitle && (
          <p className="mt-1 text-[11px] sm:text-[12px] text-gray-500 line-clamp-1">
            {bundleTitle}
          </p>
        )}
      </div>

      <hr className="border-gray-300 mb-2" />

      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <p className="font-semibold text-[#273E8E] text-[16px] max-sm:text-[14px]">{price}</p>
          {(oldPrice || discount) && (
            <div className="flex items-center gap-2 mt-1">
              {oldPrice && (
                <p className="text-gray-400 line-through text-[11px] max-sm:text-[8px]">{oldPrice}</p>
              )}
              {discount && (
                <span className="px-2 py-[2px] rounded-full text-[#FFA500] max-sm:text-[8px] text-[10px] bg-[#FFA500]/20 max-sm:px-1 max-sm:py-[1px]">
                  {discount}
                </span>
              )}
            </div>
          )}
        </div>

        {rating && (
          <div className="ml-2">
            <img
              src={rating}
              alt="Customer rating"
              className="w-[55px] max-sm:w-[40px] object-contain"
            />
          </div>
        )}
      </div>

      <hr className="border-gray-300 mt-2 mb-3" />

      <div className="grid grid-cols-2 gap-2 mt-auto" onClick={(e) => e.stopPropagation()}>
        <Link
          to={detailLink}
          className="h-9 border border-[#000000] text-[11px] max-sm:text-[8px] rounded-full max-sm:rounded-2xl text-[#181919] max-sm:h-7 flex items-center justify-center hover:bg-gray-50 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          Learn More
        </Link>
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!id || adding}
          title={err || ""}
          className="h-9 text-[10px] sm:text-[11px] rounded-full bg-[#273e8e] max-sm:text-[8px] max-sm:rounded-2xl max-sm:h-7 text-white flex items-center justify-center hover:bg-[#1a2b6b] transition-colors disabled:opacity-60"
        >
          {adding ? "Adding…" : "Add to cart"}
        </button>
      </div>
    </div>
  );
};

export default SolarBundleComponent;
