import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BASE_URL } from "../config/api.config";

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, "");

const toAbsolute = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${API_ORIGIN}${path}`;
  const cleaned = String(path).replace(/^public\//, "");
  return `${API_ORIGIN}/storage/${cleaned}`;
};

export const getBundleGalleryImages = (bundle, fallback = "") => {
  if (!bundle) return fallback ? [fallback] : [];
  const featured =
    (bundle.featured_image && toAbsolute(bundle.featured_image)) ||
    (bundle.featured_image_url && toAbsolute(bundle.featured_image_url)) ||
    null;
  const galleryOnly = (Array.isArray(bundle.images) ? bundle.images : [])
    .map((img) => toAbsolute(img?.image_url || img?.image || img))
    .filter(Boolean);
  const gallery = [];
  const seen = new Set();
  [featured, ...galleryOnly].forEach((src) => {
    if (!src) return;
    const key = String(src).trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    gallery.push(key);
  });
  if (gallery.length === 0 && fallback) return [fallback];
  return gallery;
};

const BundleImageSwiper = ({ images, title, className = "h-[350px]", fallback = "" }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const slides = (Array.isArray(images) ? images.filter(Boolean) : []).length
    ? images.filter(Boolean)
    : fallback
      ? [fallback]
      : [];

  if (slides.length === 0) return null;

  if (slides.length === 1) {
    return (
      <div className={`relative ${className} bg-[#F8FAFC] rounded-lg flex justify-center items-center overflow-hidden`}>
        <img src={slides[0]} alt={title || "Bundle"} className="max-h-[80%] object-contain" />
      </div>
    );
  }

  const next = () => setCurrentIndex((p) => (p + 1) % slides.length);
  const prev = () => setCurrentIndex((p) => (p - 1 + slides.length) % slides.length);

  return (
    <div className="w-full">
      <div className={`relative ${className} bg-[#F8FAFC] rounded-lg flex justify-center items-center overflow-hidden`}>
        <img
          src={slides[currentIndex]}
          alt={`${title || "Bundle"} ${currentIndex + 1}`}
          className="max-h-[80%] object-contain"
        />
        <button
          type="button"
          onClick={prev}
          className="absolute left-2 top-1/2 -translate-y-1/2 bg-white border border-gray-200 hover:bg-gray-50 rounded-full p-2 shadow-md"
          aria-label="Previous image"
        >
          <ChevronLeft size={22} className="text-gray-700" />
        </button>
        <button
          type="button"
          onClick={next}
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-white border border-gray-200 hover:bg-gray-50 rounded-full p-2 shadow-md"
          aria-label="Next image"
        >
          <ChevronRight size={22} className="text-gray-700" />
        </button>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded-full text-xs font-medium">
          {currentIndex + 1} / {slides.length}
        </div>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {slides.map((src, idx) => (
          <button
            key={`${src}-${idx}`}
            type="button"
            onClick={() => setCurrentIndex(idx)}
            className={`shrink-0 h-16 w-16 rounded-md overflow-hidden border-2 bg-[#F8FAFC] ${
              idx === currentIndex ? "border-[#0F3B7A]" : "border-transparent opacity-80 hover:opacity-100"
            }`}
            aria-label={`View image ${idx + 1}`}
          >
            <img src={src} alt="" className="h-full w-full object-contain" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default BundleImageSwiper;
