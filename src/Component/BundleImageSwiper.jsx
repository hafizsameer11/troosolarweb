import React, { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BASE_URL } from "../config/api.config";

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, "");
const ZOOM = 2.4;

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

const ZoomableImage = ({ src, alt, className = "" }) => {
  const wrapRef = useRef(null);
  const [zoom, setZoom] = useState({ active: false, x: 50, y: 50 });

  const onMove = (e) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoom({ active: true, x, y });
  };

  return (
    <div
      ref={wrapRef}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden cursor-zoom-in ${className}`}
      onMouseEnter={onMove}
      onMouseMove={onMove}
      onMouseLeave={() => setZoom((z) => ({ ...z, active: false }))}
    >
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full w-auto h-auto object-contain transition-opacity duration-150"
        style={{
          opacity: zoom.active ? 0 : 1,
          transformOrigin: `${zoom.x}% ${zoom.y}%`,
        }}
        draggable={false}
      />
      {zoom.active && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${src})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: `${zoom.x}% ${zoom.y}%`,
            backgroundSize: `${ZOOM * 100}%`,
          }}
          aria-hidden
        />
      )}
    </div>
  );
};

const BundleImageSwiper = ({ images, title, className = "h-[350px]", fallback = "" }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const filtered = Array.isArray(images) ? images.filter(Boolean) : [];
  const slides = filtered.length ? filtered : fallback ? [fallback] : [];

  if (slides.length === 0) return null;

  const frame = (
    <div className={`relative ${className} bg-[#F8FAFC] rounded-lg overflow-hidden`}>
      <ZoomableImage
        src={slides[currentIndex]}
        alt={slides.length === 1 ? title || "Bundle" : `${title || "Bundle"} ${currentIndex + 1}`}
      />
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setCurrentIndex((p) => (p - 1 + slides.length) % slides.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-white border border-gray-200 hover:bg-gray-50 rounded-full p-2 shadow-md"
            aria-label="Previous image"
          >
            <ChevronLeft size={22} className="text-gray-700" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentIndex((p) => (p + 1) % slides.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-white border border-gray-200 hover:bg-gray-50 rounded-full p-2 shadow-md"
            aria-label="Next image"
          >
            <ChevronRight size={22} className="text-gray-700" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-black/70 text-white px-3 py-1 rounded-full text-xs font-medium">
            {currentIndex + 1} / {slides.length}
          </div>
        </>
      )}
    </div>
  );

  if (slides.length === 1) return frame;

  return (
    <div className="w-full">
      {frame}
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
