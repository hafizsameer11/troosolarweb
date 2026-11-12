import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { BASE_URL } from "../config/api.config";

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, "");
const HOVER_ZOOM = 2.4;
const TOUCH_ZOOM = 2.6;
const MIN_PINCH = 1;
const MAX_PINCH = 4;

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

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const touchDistance = (touches) => {
  const [a, b] = touches;
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
};

const ZoomableImage = ({ src, alt, className = "", showMobileHint = true, enableHoverZoom = true }) => {
  const wrapRef = useRef(null);
  const lastTapRef = useRef(0);
  const pinchRef = useRef(null);
  const dragRef = useRef(null);

  const [hover, setHover] = useState({ active: false, x: 50, y: 50 });
  const [touch, setTouch] = useState({ scale: 1, x: 0, y: 0 });

  useEffect(() => {
    setHover({ active: false, x: 50, y: 50 });
    setTouch({ scale: 1, x: 0, y: 0 });
    pinchRef.current = null;
    dragRef.current = null;
  }, [src]);

  const onHoverMove = (e) => {
    if (!enableHoverZoom || touch.scale > 1.01) return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setHover({ active: true, x, y });
  };

  const clampPan = (scale, x, y) => {
    const el = wrapRef.current;
    if (!el || scale <= 1) return { scale: 1, x: 0, y: 0 };
    const maxX = ((scale - 1) * el.clientWidth) / 2;
    const maxY = ((scale - 1) * el.clientHeight) / 2;
    return {
      scale,
      x: clamp(x, -maxX, maxX),
      y: clamp(y, -maxY, maxY),
    };
  };

  const onTouchStart = (e) => {
    setHover({ active: false, x: 50, y: 50 });
    if (e.touches.length === 2) {
      pinchRef.current = {
        startDist: touchDistance(e.touches),
        startScale: touch.scale,
        startX: touch.x,
        startY: touch.y,
      };
      dragRef.current = null;
      return;
    }
    if (e.touches.length === 1) {
      const now = Date.now();
      const isDoubleTap = now - lastTapRef.current < 280;
      lastTapRef.current = now;

      if (isDoubleTap) {
        e.preventDefault();
        setTouch((prev) => {
          if (prev.scale > 1.05) return { scale: 1, x: 0, y: 0 };
          const el = wrapRef.current;
          if (!el) return { scale: TOUCH_ZOOM, x: 0, y: 0 };
          const rect = el.getBoundingClientRect();
          const t = e.touches[0];
          const cx = t.clientX - rect.left - rect.width / 2;
          const cy = t.clientY - rect.top - rect.height / 2;
          return clampPan(TOUCH_ZOOM, -cx * (TOUCH_ZOOM - 1), -cy * (TOUCH_ZOOM - 1));
        });
        dragRef.current = null;
        return;
      }

      if (touch.scale > 1.01) {
        dragRef.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          originX: touch.x,
          originY: touch.y,
        };
      }
    }
  };

  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const { startDist, startScale, startX, startY } = pinchRef.current;
      const nextScale = clamp(startScale * (touchDistance(e.touches) / startDist), MIN_PINCH, MAX_PINCH);
      setTouch(clampPan(nextScale, startX, startY));
      return;
    }
    if (e.touches.length === 1 && dragRef.current && touch.scale > 1.01) {
      e.preventDefault();
      const dx = e.touches[0].clientX - dragRef.current.startX;
      const dy = e.touches[0].clientY - dragRef.current.startY;
      setTouch(clampPan(touch.scale, dragRef.current.originX + dx, dragRef.current.originY + dy));
    }
  };

  const onTouchEnd = (e) => {
    if (e.touches.length < 2) pinchRef.current = null;
    if (e.touches.length === 0) {
      dragRef.current = null;
      setTouch((prev) => (prev.scale < 1.05 ? { scale: 1, x: 0, y: 0 } : prev));
    }
  };

  const zoomed = touch.scale > 1.01;

  return (
    <div
      ref={wrapRef}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden touch-none select-none ${
        zoomed ? "cursor-grab active:cursor-grabbing" : enableHoverZoom ? "cursor-zoom-in" : ""
      } ${className}`}
      onMouseEnter={onHoverMove}
      onMouseMove={onHoverMove}
      onMouseLeave={() => setHover((z) => ({ ...z, active: false }))}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full w-auto h-auto object-contain will-change-transform"
        style={{
          opacity: hover.active && !zoomed ? 0 : 1,
          transform: `translate3d(${touch.x}px, ${touch.y}px, 0) scale(${touch.scale})`,
          transition: dragRef.current || pinchRef.current ? "none" : "transform 160ms ease-out",
        }}
        draggable={false}
      />
      {enableHoverZoom && hover.active && !zoomed && (
        <div
          className="absolute inset-0 pointer-events-none hidden md:block"
          style={{
            backgroundImage: `url(${src})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: `${hover.x}% ${hover.y}%`,
            backgroundSize: `${HOVER_ZOOM * 100}%`,
          }}
          aria-hidden
        />
      )}
      {showMobileHint && (
        <div className="pointer-events-none absolute bottom-2 left-2 md:hidden rounded-full bg-black/55 px-2.5 py-1 text-[10px] text-white">
          {zoomed ? "Drag to move · Double-tap to reset" : "Pinch or double-tap to zoom"}
        </div>
      )}
    </div>
  );
};

const MobileImageLightbox = ({ slides, index, title, onClose, onChangeIndex }) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] md:hidden bg-black/95 flex flex-col" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <p className="min-w-0 flex-1 truncate text-sm text-white/90">
          {title || "Bundle image"}
          {slides.length > 1 ? ` · ${index + 1}/${slides.length}` : ""}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full bg-white/15 p-2 text-white"
          aria-label="Close image"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 mx-1 mb-2">
        <ZoomableImage
          key={`lightbox-${slides[index]}`}
          src={slides[index]}
          alt={title || "Bundle"}
          className="rounded-lg bg-black"
          showMobileHint
          enableHoverZoom={false}
        />
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => onChangeIndex((index - 1 + slides.length) % slides.length)}
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow"
              aria-label="Previous image"
            >
              <ChevronLeft size={22} className="text-gray-800" />
            </button>
            <button
              type="button"
              onClick={() => onChangeIndex((index + 1) % slides.length)}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow"
              aria-label="Next image"
            >
              <ChevronRight size={22} className="text-gray-800" />
            </button>
          </>
        )}
      </div>

      {slides.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {slides.map((src, idx) => (
            <button
              key={`${src}-lb-${idx}`}
              type="button"
              onClick={() => onChangeIndex(idx)}
              className={`shrink-0 h-14 w-14 overflow-hidden rounded-md border-2 bg-white/10 ${
                idx === index ? "border-white" : "border-transparent opacity-70"
              }`}
              aria-label={`View image ${idx + 1}`}
            >
              <img src={src} alt="" className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
};

const BundleImageSwiper = ({ images, title, className = "h-[350px]", fallback = "" }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const filtered = Array.isArray(images) ? images.filter(Boolean) : [];
  const slides = filtered.length ? filtered : fallback ? [fallback] : [];

  if (slides.length === 0) return null;

  const frame = (
    <div className={`relative ${className} bg-[#F8FAFC] rounded-lg overflow-hidden`}>
      <ZoomableImage
        key={slides[currentIndex]}
        src={slides[currentIndex]}
        alt={slides.length === 1 ? title || "Bundle" : `${title || "Bundle"} ${currentIndex + 1}`}
        showMobileHint={false}
      />

      {/* Mobile-only open fullscreen */}
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="absolute top-2 right-2 z-20 md:hidden rounded-full bg-black/60 p-2 text-white shadow-md"
        aria-label="Open image fullscreen"
      >
        <Expand size={18} />
      </button>

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

  return (
    <div className="w-full">
      {frame}
      {slides.length > 1 && (
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
      )}
      {lightboxOpen && (
        <MobileImageLightbox
          slides={slides}
          index={currentIndex}
          title={title}
          onClose={() => setLightboxOpen(false)}
          onChangeIndex={setCurrentIndex}
        />
      )}
    </div>
  );
};

export default BundleImageSwiper;
