import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronLeft, Star, Loader2 } from "lucide-react";
import ReviewModal from "./ReviewModal";
import { assets } from "../../assets/data";
import API, { BASE_URL } from "../../config/api.config";
import axios from "axios";
import Loading from "../Loading";
import PaymentSummaryCard from "./PaymentSummaryCard";

/** Fallback image when item has no featured_image */
const PLACEHOLDER_IMAGE = "https://api.troosolar.com/storage/products/d5c7f116-57ed-46ef-a659-337c94c308a9.png";

/** Parse API money (handles numbers, "25000.00", "25,000", etc.) */
const parseMoney = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(/,/g, "").replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

const formatNgn = (amount) =>
  `₦${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

/** Payment breakdown for order detail — mirrors checkout invoice lines. */
const buildOrderPaymentBreakdown = (rawData) => {
  if (!rawData) return null;

  const items = Array.isArray(rawData.items) ? rawData.items : [];
  const itemsFromLines = items.reduce(
    (sum, line) => sum + parseMoney(line?.subtotal),
    0
  );

  const catalogSubtotal =
    parseMoney(rawData.catalog_items_subtotal) || itemsFromLines;
  let itemsAfterDiscount = parseMoney(rawData.items_subtotal) || catalogSubtotal;
  let discount = parseMoney(rawData.online_checkout_discount_amount);

  const delivery = parseMoney(rawData.delivery_fee);
  const installation = parseMoney(rawData.installation_price);
  const insurance = parseMoney(rawData.insurance_fee);
  const material = parseMoney(rawData.material_cost);
  const inspection = parseMoney(rawData.inspection_fee);
  const serviceFeesTotal = delivery + installation + material + inspection;

  let vat = parseMoney(rawData.vat_amount);
  const vatPct = parseMoney(rawData.vat_percentage) || 7.5;
  const orderTotal = parseMoney(rawData.total_price);

  if (discount <= 0 && catalogSubtotal > itemsAfterDiscount + 0.005) {
    discount = catalogSubtotal - itemsAfterDiscount;
  }

  if (
    discount <= 0 &&
    catalogSubtotal > 0 &&
    orderTotal > 0 &&
    String(rawData.order_type || "").toLowerCase() === "buy_now"
  ) {
    const inferredAfter = orderTotal - serviceFeesTotal - vat - insurance;
    if (inferredAfter > 0 && inferredAfter + 0.005 < catalogSubtotal) {
      itemsAfterDiscount = inferredAfter;
      discount = catalogSubtotal - inferredAfter;
    }
  }

  if (vat <= 0 && itemsAfterDiscount > 0 && orderTotal > 0) {
    const totalAmountBeforeVat = itemsAfterDiscount + serviceFeesTotal;
    const expectedVat = Math.round(totalAmountBeforeVat * (vatPct / 100) * 100) / 100;
    if (Math.abs(orderTotal - (totalAmountBeforeVat + expectedVat + insurance)) < 1) {
      vat = expectedVat;
    }
  }

  const pctRaw =
    parseMoney(rawData.outright_discount_percentage) ||
    items.find((i) => parseMoney(i?.referral_outright_discount_percent) > 0)
      ?.referral_outright_discount_percent;
  const outrightDiscountPct =
    pctRaw != null && String(pctRaw).trim() !== ""
      ? Math.round(Number(pctRaw))
      : String(rawData.order_type || "").toLowerCase() === "buy_now"
      ? 10
      : discount > 0 && catalogSubtotal > 0
      ? Math.round((discount / catalogSubtotal) * 100)
      : null;
  const discountPctLabel =
    outrightDiscountPct != null && String(outrightDiscountPct).trim() !== ""
      ? ` (${outrightDiscountPct}%)`
      : discount > 0 && catalogSubtotal > 0
      ? ` (${Math.round((discount / catalogSubtotal) * 100)}%)`
      : "";

  const totalAmount = itemsAfterDiscount + serviceFeesTotal;

  return {
    catalogSubtotal,
    discount,
    discountPctLabel,
    outrightDiscountPct,
    itemsAfterDiscount,
    delivery,
    installation,
    insurance,
    material,
    inspection,
    serviceFeesTotal,
    totalAmount,
    vat,
    vatPct,
    orderTotal,
  };
};

/** Compare titles so bundle subtitle is hidden when it duplicates the main title (spacing/case). */
const normalizeTitleKey = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Normalize API line item type (product | bundle) from itemable_type or type fields. */
const normalizeLineItemKind = (lineItem) => {
  const raw = String(
    lineItem?.itemable_type || lineItem?.type || ""
  ).toLowerCase();
  if (!raw) return null;
  if (raw === "product" || raw.endsWith("\\product") || raw === "products") {
    return "product";
  }
  if (raw === "bundle" || raw === "bundles" || raw.includes("bundle")) {
    return "bundle";
  }
  return null;
};

const isProductLineItem = (lineItem) =>
  normalizeLineItemKind(lineItem) === "product";

const isBundleLineItem = (lineItem) =>
  normalizeLineItemKind(lineItem) === "bundle";

const getProductIdFromLineItem = (lineItem) => {
  if (!isProductLineItem(lineItem)) return null;
  const id = lineItem?.itemable_id ?? lineItem?.item?.id;
  if (id == null || id === "") return null;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const getBundleIdFromLineItem = (lineItem) => {
  if (!isBundleLineItem(lineItem)) return null;
  const id = lineItem?.itemable_id ?? lineItem?.item?.id;
  if (id == null || id === "") return null;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const getBundleDetailPath = (lineItem) => {
  const bundleId = getBundleIdFromLineItem(lineItem);
  return bundleId ? `/productBundle/details/${bundleId}` : null;
};

const reviewItemKey = (type, id) => `${type}-${id}`;

/** Products and bundles the customer can review on this order. */
const getReviewableItemsFromOrder = (rawData, displayItems = null) => {
  const items = [];
  const seen = new Set();
  const lines =
    Array.isArray(displayItems) && displayItems.length > 0
      ? displayItems
      : Array.isArray(rawData?.items)
        ? rawData.items
        : [];

  for (const line of lines) {
    const productId = getProductIdFromLineItem(line);
    if (productId && !seen.has(`product-${productId}`)) {
      seen.add(`product-${productId}`);
      items.push({
        type: "product",
        id: productId,
        title:
          line?.item?.title ||
          line?.item?.name ||
          line?.title ||
          line?.name ||
          "Product",
      });
    }

    const bundleId = getBundleIdFromLineItem(line);
    if (bundleId && !seen.has(`bundle-${bundleId}`)) {
      seen.add(`bundle-${bundleId}`);
      items.push({
        type: "bundle",
        id: bundleId,
        title:
          line?.item?.title ||
          line?.item?.name ||
          line?.title ||
          line?.name ||
          "Bundle",
      });
    }
  }

  if (items.length === 0 && rawData?.product_id) {
    const n = Number(rawData.product_id);
    if (Number.isFinite(n) && n > 0) {
      items.push({ type: "product", id: n, title: "Product" });
    }
  }

  if (items.length === 0 && rawData?.bundle_id) {
    const n = Number(rawData.bundle_id);
    if (Number.isFinite(n) && n > 0) {
      items.push({ type: "bundle", id: n, title: "Bundle" });
    }
  }

  return items;
};

const mapApiReviewToState = (review, userInfo) => {
  const adminReply =
    review.admin_reply && String(review.admin_reply).trim()
      ? String(review.admin_reply).trim()
      : null;
  return {
    id: review.id,
    productId: review.product_id,
    bundleId: review.bundle_id,
    rating: review.rating,
    reviewText: review.review,
    userName:
      userInfo?.name?.trim() ||
      [userInfo?.first_name, userInfo?.sur_name].filter(Boolean).join(" ") ||
      "User",
    userInitials:
      (userInfo?.first_name?.[0] || userInfo?.name?.[0] || "U") +
      (userInfo?.sur_name?.[0] || ""),
    date: new Date(review.created_at)
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      })
      .replace(/\//g, "-"),
    adminReply,
    adminRepliedAt: review.admin_replied_at || null,
  };
};

const isDeliveredOrCompleted = (status) => {
  const s = String(status || "").trim().toLowerCase();
  return s === "delivered" || s === "completed" || s === "complete";
};

/** Delivered orders only — matches backend review rules. */
const isReviewAllowedOrder = (orderStatus) => {
  const os = String(orderStatus || "").trim().toLowerCase();
  if (["cancelled", "refunded"].includes(os)) return false;
  return isDeliveredOrCompleted(os);
};

const OrderSummary = ({ order, onBack }) => {
  const [showReviewModal, setShowReviewModal] = useState(false);
  /** Map review key (product-1 / bundle-2) → review object, or `null` if none. */
  const [reviewsByKey, setReviewsByKey] = useState({});
  const [reviewModalTarget, setReviewModalTarget] = useState(null);
  const [reviewModalProductTitle, setReviewModalProductTitle] = useState("");
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState(null);

  const fetchReviewsForOrderItems = useCallback(async (rawData, displayItems) => {
    const reviewItems = getReviewableItemsFromOrder(rawData, displayItems);
    const userInfo = rawData?.user_info;
    const token = localStorage.getItem("access_token");
    if (!token || reviewItems.length === 0) {
      setReviewsByKey({});
      return;
    }
    const next = {};
    await Promise.all(
      reviewItems.map(async (item) => {
        const key = reviewItemKey(item.type, item.id);
        try {
          const params =
            item.type === "bundle"
              ? { bundle_id: item.id, mine: 1 }
              : { product_id: item.id, mine: 1 };
          const response = await axios.get(API.Product_Reviews, {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
            params,
          });
          if (response.data.status === "success" && response.data.data?.length > 0) {
            next[key] = mapApiReviewToState(response.data.data[0], userInfo);
          } else {
            next[key] = null;
          }
        } catch (err) {
          console.error("Error fetching review for", key, err);
          next[key] = null;
        }
      })
    );
    setReviewsByKey(next);
  }, []);

  // Fetch order details from API
  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem("access_token");
        const response = await axios.get(`${API.ORDERS}/${order.id}`, {
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (response.data.status === "success") {
          const data = response.data.data;

          // Build address from delivery_address, or from BNPL application (property_address) when missing
          const addr = data.delivery_address;
          const appAddr = data.loan_application || data.application_address;
          const deliveryAddressText =
            addr?.address ||
            [addr?.state, addr?.title].filter(Boolean).join(", ") ||
            appAddr?.property_address ||
            (appAddr?.address && [appAddr.address, appAddr.state].filter(Boolean).join(", ")) ||
            [appAddr?.state, appAddr?.title].filter(Boolean).join(", ") ||
            "Address not provided";
          const phoneNumber =
            addr?.phone_number ||
            appAddr?.phone_number ||
            data.user_info?.phone ||
            "Phone not provided";
          // Always use the order owner's profile — never the admin/viewer's account (include_user_info / viewer_account)
          const customerName =
            (data.user_info?.name && String(data.user_info.name).trim()) ||
            [data.user_info?.first_name, data.user_info?.sur_name].filter(Boolean).join(" ").trim() ||
            "Customer";
          const customerEmail = data.user_info?.email || "Email not provided";
          const contactNameDisplay =
            (addr?.contact_name && String(addr.contact_name).trim()) ||
            customerName;
          const fmtEst = (iso) => {
            if (!iso) return null;
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return null;
            return d.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
          };
          const estimatedDeliverySummary =
            data.estimated_delivery_from && data.estimated_delivery_to
              ? `${fmtEst(data.estimated_delivery_from)} – ${fmtEst(data.estimated_delivery_to)}${
                  data.delivery_estimate_label
                    ? ` (${data.delivery_estimate_label})`
                    : ""
                }`
              : data.delivery_estimate_label || null;
          const orderPlacedDate = new Date(data.created_at).toLocaleDateString(
            "en-GB",
            {
              weekday: "short",
              day: "numeric",
              month: "long",
              year: "numeric",
            }
          );

          // Total quantity across all line items; keep items array for per-line display
          const items = Array.isArray(data.items) ? data.items : [];
          const totalQuantity = items.reduce(
            (sum, i) => sum + (Number(i?.quantity) || 0),
            0
          ) || 1;

          // Transform API data to match component structure
          const transformedData = {
            id: data.id,
            orderNumber: data.order_number,
            orderStatus: data.order_status,
            paymentStatus: data.payment_status,
            productName:
              data.items?.[0]?.item?.title ||
              data.items?.[0]?.item?.name ||
              "Purchase",
            price: formatNgn(parseMoney(data.total_price)),
            deliveryDate: orderPlacedDate,
            orderPlacedDate,
            estimatedDeliverySummary,
            deliveryAddress: deliveryAddressText,
            contactNameDisplay,
            phoneNumber,
            customerName,
            customerEmail,
            paymentMethod:
              data.payment_method === "direct" ? "Direct" : data.payment_method,
            charge:
              data.delivery_fee != null && Number(data.delivery_fee) > 0
                ? `₦${Number(data.delivery_fee).toLocaleString()}`
                : "Free",
            insuranceFee:
              data.insurance_fee != null && Number(data.insurance_fee) > 0
                ? `₦${Number(data.insurance_fee).toLocaleString()}`
                : null,
            installationFee:
              data.installation_price != null &&
              Number(data.installation_price) > 0
                ? `₦${Number(data.installation_price).toLocaleString()}`
                : null,
            productImage: (() => {
              const img = data.items?.[0]?.item?.featured_image;
              if (!img) return PLACEHOLDER_IMAGE;
              return img.startsWith("http") ? img : `${BASE_URL.replace("/api", "")}${img}`;
            })(),
            technicianName: data.installation?.technician_name,
            userInfo: data.user_info,
            includeUserInfo: data.viewer_account ?? data.include_user_info,
            // Additional API data
            rawData: data,
            quantity: totalQuantity,
            items, // full items list for per-line display
            unitPrice: data.items?.[0]?.unit_price || data.total_price,
            subtotal: data.items?.[0]?.subtotal || data.total_price,
          };

          setOrderData(transformedData);

          await fetchReviewsForOrderItems(data, items);
        }
      } catch (err) {
        console.error("Error fetching order details:", err);
        setError("Failed to load order details");
      } finally {
        setLoading(false);
      }
    };

    if (order?.id) {
      fetchOrderDetails();
    } else {
      setError("Order ID not provided");
      setLoading(false);
    }
  }, [order?.id, fetchReviewsForOrderItems]);

  const handleReviewSubmit = async (reviewData) => {
    const target = reviewModalTarget;
    if (!target?.id) {
      setReviewError("Item not found for review");
      return;
    }

    const key = reviewItemKey(target.type, target.id);
    const existingReview = reviewsByKey[key];
    if (existingReview?.id) {
      setReviewError("You have already submitted a review for this item.");
      return;
    }

    try {
      setReviewLoading(true);
      setReviewError(null);

      const token = localStorage.getItem("access_token");
      if (!token) {
        setReviewError("Please log in to submit a review");
        return;
      }

      const orderId =
        reviewModalTarget?.orderId ??
        orderData?.rawData?.id ??
        orderData?.id;
      const payload = {
        review: reviewData.reviewText,
        rating: Number(reviewData.rating),
        ...(orderId != null ? { order_id: Number(orderId) } : {}),
        ...(target.type === "bundle"
          ? { bundle_id: Number(target.id) }
          : { product_id: Number(target.id) }),
      };

      const response = await axios.post(API.Product_Reviews, payload, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data.status === "success") {
        const authUser = orderData?.rawData?.user_info || orderData?.userInfo || {};
        const saved = response.data.data || {};
        const adminReply =
          saved.admin_reply && String(saved.admin_reply).trim()
            ? String(saved.admin_reply).trim()
            : existingReview?.adminReply ?? null;
        const adminRepliedAt =
          saved.admin_replied_at ?? existingReview?.adminRepliedAt ?? null;

        setReviewsByKey((prev) => ({
          ...prev,
          [key]: {
            id: saved.id || existingReview?.id,
            productId: saved.product_id ?? (target.type === "product" ? target.id : null),
            bundleId: saved.bundle_id ?? (target.type === "bundle" ? target.id : null),
            rating: reviewData.rating,
            reviewText: reviewData.reviewText,
            userName:
              authUser?.name ||
              [authUser?.first_name, authUser?.sur_name].filter(Boolean).join(" ") ||
              "User",
            userInitials:
              (authUser?.first_name?.[0] || authUser?.name?.[0] || "U") +
              (authUser?.sur_name?.[0] || ""),
            date: new Date()
              .toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
              })
              .replace(/\//g, "-"),
            adminReply,
            adminRepliedAt,
          },
        }));

        setShowReviewModal(false);
        setReviewModalTarget(null);
        setReviewModalProductTitle("");
        alert("Review submitted successfully!");
      } else {
        setReviewError("Failed to submit review");
      }
    } catch (err) {
      console.error("Error submitting review:", err);
      setReviewError(err?.response?.data?.message || err?.message || "Failed to submit review");
    } finally {
      setReviewLoading(false);
    }
  };

  const openReviewModal = (target, productTitle, lineItem = null) => {
    if (!target?.id && !lineItem) return;
    const orderId = orderData?.rawData?.id ?? orderData?.id;
    const resolvedProductId = lineItem ? getProductIdFromLineItem(lineItem) : null;
    const resolvedBundleId = lineItem ? getBundleIdFromLineItem(lineItem) : null;
    const resolvedId =
      target?.type === "bundle"
        ? resolvedBundleId ?? target?.id
        : resolvedProductId ?? target?.id;
    if (!resolvedId) return;

    const resolvedType = target?.type === "bundle" ? "bundle" : "product";
    const key = reviewItemKey(resolvedType, Number(resolvedId));
    if (reviewsByKey[key]?.id) return;

    setReviewModalTarget({
      type: resolvedType,
      id: Number(resolvedId),
      orderId: orderId != null ? Number(orderId) : null,
    });
    setReviewModalProductTitle(productTitle || "");
    setReviewError(null);
    setShowReviewModal(true);
  };

  const closeReviewModal = () => {
    if (reviewLoading) return;
    setShowReviewModal(false);
    setReviewModalTarget(null);
    setReviewModalProductTitle("");
    setReviewError(null);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loading fullScreen={false} message="Loading order details..." progress={null} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <div className="space-x-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#273e8e] text-white rounded-lg hover:bg-[#1e327a] transition-colors"
            >
              Retry
            </button>
            <button
              onClick={onBack}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No data state
  if (!orderData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">No order data available</p>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-[#273e8e] text-white rounded-lg hover:bg-[#1e327a] transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const canReviewOrder = isReviewAllowedOrder(orderData.orderStatus);
  const reviewableItems = getReviewableItemsFromOrder(
    orderData.rawData,
    orderData.items
  );
  const hasReviewableItems = reviewableItems.length > 0;

  const getReviewTargetForLineItem = (lineItem) => {
    const productId = getProductIdFromLineItem(lineItem);
    if (productId) return { type: "product", id: productId };
    const bundleId = getBundleIdFromLineItem(lineItem);
    if (bundleId) return { type: "bundle", id: bundleId };
    return null;
  };

  const renderReviewSection = (target, itemTitle, lineItem = null) => {
    if (!target?.id || !canReviewOrder) return null;
    const key = reviewItemKey(target.type, target.id);
    const rev = reviewsByKey[key];
    return (
      <div className="mt-3 pt-3 border-t border-gray-200">
        {rev ? (
          <div className="mb-2 space-y-1">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  size={14}
                  className={
                    star <= rev.rating
                      ? "text-[#273E8E] fill-current"
                      : "text-gray-300"
                  }
                />
              ))}
              <span className="text-xs text-gray-600 ml-1">Your review</span>
            </div>
            {rev.reviewText ? (
              <p className="text-xs text-gray-700 line-clamp-2">{rev.reviewText}</p>
            ) : null}
            {rev.adminReply ? (
              <div className="text-xs text-gray-800 mt-1 p-2 bg-[#f5f7ff] rounded-lg border border-[#273e8e]/20">
                <span className="font-semibold text-[#273e8e]">Troosolar</span>
                <p className="whitespace-pre-wrap mt-0.5">{rev.adminReply}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        {!rev ? (
          <button
            type="button"
            onClick={() => openReviewModal(target, itemTitle, lineItem)}
            className="text-sm font-medium text-[#273e8e] hover:text-[#1e327a] underline-offset-2 hover:underline"
          >
            {`Rate this ${target.type === "bundle" ? "bundle" : "product"}`}
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Web Header with Back Arrow */}
      <div className="hidden sm:block bg-white border-b border-gray-300">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ChevronLeft size={20} />
            <span className="text-sm font-medium">Back to Order Details</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 py-6 space-y-6 bg-white">
        {/* Order Status Banner - "Congratulations delivered" only when delivered */}
        {(() => {
          const isDelivered =
            String(orderData.orderStatus || "").toLowerCase() === "delivered" ||
            String(orderData.orderStatus || "").toLowerCase() === "completed" ||
            String(orderData.orderStatus || "").toLowerCase() === "complete";
          return (
            <div className="bg-white rounded-2xl p-6 text-center mt-4 border border-gray-400">
              <div className="flex justify-center items-center">
                <img
                  src={assets.tick}
                  alt="tick"
                  className="w-20 h-20 align-middle mb-4"
                />
              </div>
              <h2 className="text-sm font-semibold text-gray-900 text-center max-w-md mx-auto">
                {isDelivered ? (
                  <>
                    <b>Congratulations</b> — your order {orderData.orderNumber}{" "}
                    has been successfully delivered
                  </>
                ) : (
                  <>
                    Your order <b>{orderData.orderNumber}</b> is confirmed
                    {orderData.orderPlacedDate ? (
                      <> (placed on {orderData.orderPlacedDate})</>
                    ) : null}
                    {orderData.estimatedDeliverySummary ? (
                      <span className="block mt-2 text-xs font-normal text-gray-600">
                        Estimated delivery: {orderData.estimatedDeliverySummary}
                      </span>
                    ) : null}
                  </>
                )}
              </h2>
              <div className="mt-2 text-xs text-gray-600">
                Order Status:{" "}
                <span className="font-medium capitalize">
                  {orderData.orderStatus}
                </span>{" "}
                | Payment Status:{" "}
                <span className="font-medium capitalize">
                  {orderData.paymentStatus}
                </span>
              </div>
            </div>
          );
        })()}

        {/* Product Details Section - show all line items with correct quantity */}
        <div>
          <div className="flex ">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Product Details
            </h3>
            <hr className="border-gray-400" />
          </div>
          <div className="bg-white rounded-2xl p-2 border border-gray-400 space-y-4">
            {Array.isArray(orderData.items) && orderData.items.length > 0 ? (
              orderData.items.map((lineItem, idx) => {
                const rawImg = lineItem?.item?.featured_image;
                const img = rawImg
                  ? (rawImg.startsWith("http") ? rawImg : `${BASE_URL.replace("/api", "")}${rawImg}`)
                  : PLACEHOLDER_IMAGE;
                const qty = Number(lineItem?.quantity) || 1;
                const lineSubtotal = parseMoney(lineItem?.subtotal);
                const unitPrice = parseMoney(lineItem?.unit_price);
                const listUnitPrice = parseMoney(lineItem?.list_unit_price);
                const outrightPct = parseMoney(
                  lineItem?.referral_outright_discount_percent
                );
                const displayAmount =
                  lineSubtotal > 0 ? lineSubtotal : unitPrice > 0 ? unitPrice * qty : 0;
                const bundlePath = getBundleDetailPath(lineItem);
                const lineTitle =
                  lineItem?.item?.title || lineItem?.item?.name || lineItem?.name || "Purchase";
                return (
                  <div
                    key={idx}
                    className="flex items-start gap-4"
                  >
                    {bundlePath ? (
                      <Link
                        to={bundlePath}
                        className="w-20 h-20 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0 hover:opacity-90 transition-opacity"
                      >
                        <img
                          src={img}
                          alt={lineTitle}
                          className="w-16 h-16 bg-gray-200 rounded-lg object-cover"
                        />
                      </Link>
                    ) : (
                      <div className="w-20 h-20 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <img
                          src={img}
                          alt={lineTitle}
                          className="w-16 h-16 bg-gray-200 rounded-lg object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {bundlePath ? (
                        <Link
                          to={bundlePath}
                          className="text-sm font-medium text-gray-900 mb-2 hover:text-[#273E8E] hover:underline block"
                        >
                          {lineTitle}
                        </Link>
                      ) : (
                        <h4 className="text-sm font-medium text-gray-900 mb-2">
                          {lineTitle}
                        </h4>
                      )}
                      {lineItem?.item?.subtitle &&
                        normalizeTitleKey(lineItem.item.subtitle) !==
                          normalizeTitleKey(lineItem?.item?.title || "") && (
                        <p className="text-xs text-gray-600 mb-2">{lineItem.item.subtitle}</p>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-purple-100 text-[#000000] text-xs px-2 py-1 rounded">
                          Qty: {qty}
                        </span>
                      </div>
                      {listUnitPrice > 0 &&
                        unitPrice > 0 &&
                        listUnitPrice > unitPrice + 0.005 &&
                        outrightPct > 0 && (
                          <p className="text-xs text-gray-500 mb-1">
                            List price:{" "}
                            <span className="line-through">{formatNgn(listUnitPrice)}</span>
                            {" · "}
                            Outright discount ({outrightPct}%)
                          </p>
                        )}
                      {unitPrice > 0 && (
                        <p className="text-xs text-gray-600 mb-1">
                          Unit price (charged): {formatNgn(unitPrice)}
                        </p>
                      )}
                      <p className="text-xl font-bold text-[#273E8E]">
                        {displayAmount > 0 ? (
                          formatNgn(displayAmount)
                        ) : (
                          <span className="text-gray-600 text-sm font-normal">Amount unavailable</span>
                        )}
                      </p>
                      {renderReviewSection(
                        getReviewTargetForLineItem(lineItem),
                        lineItem?.item?.title || lineItem?.item?.name || "Purchase",
                        lineItem
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex items-start gap-4">
                <div className="w-20 h-20 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <img
                    src={orderData.productImage || PLACEHOLDER_IMAGE}
                    alt={orderData.productName}
                    className="w-16 h-16 bg-gray-200 rounded-lg object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">
                    {orderData.productName}
                  </h4>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-purple-100 text-[#000000] text-xs px-2 py-1 rounded">
                      Qty: {orderData.quantity}
                    </span>
                  </div>
                  <p className="text-xl font-bold text-[#273E8E]">
                    {orderData.price}
                  </p>
                  {renderReviewSection(
                    reviewableItems[0]
                      ? { type: reviewableItems[0].type, id: reviewableItems[0].id }
                      : null,
                    orderData.productName
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Delivery Details Section */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-6">
            Delivery Details
          </h3>
          <div className="bg-white rounded-2xl border border-gray-400 ">
            {/* Card Header */}
            <div className="px-6 py-3 border-b border-gray-300">
              <h2 className="text-base font-medium text-gray-900">
                Delivery Address
              </h2>
            </div>

            <div className="p-6 pb-1 space-y-6">
              {/* Delivery Address Box */}
              <div className="bg-gray-100 rounded-xl p-4 space-y-3">
                <div>
                  <span className="block text-xs text-gray-600">
                    Contact name (delivery)
                  </span>
                  <p className="text-sm font-medium text-gray-900">
                    {orderData.contactNameDisplay || orderData.customerName}
                  </p>
                </div>
                <div>
                  <span className="block text-xs text-gray-600">Address</span>
                  <p className="text-sm font-medium text-gray-900">
                    {orderData.deliveryAddress}
                  </p>
                </div>
                <div>
                  <span className="block text-xs text-gray-600">
                    Phone Number
                  </span>
                  <p className="text-sm font-medium text-gray-900">
                    {orderData.phoneNumber}
                  </p>
                </div>
              </div>

              {orderData.estimatedDeliverySummary && (
                <div className="flex justify-between items-center py-3 border-t border-gray-300">
                  <span className="text-sm text-gray-600">Estimated delivery</span>
                  <span className="text-sm font-medium text-gray-900 text-right max-w-[65%]">
                    {orderData.estimatedDeliverySummary}
                  </span>
                </div>
              )}

              {/* Customer Name */}
              <div className="flex justify-between items-center py-3 border-t border-gray-300 mb-0">
                <span className="text-sm text-gray-600">Account name</span>
                <span className="text-sm font-medium text-gray-900">
                  {orderData.customerName}
                </span>
              </div>

              {/* Customer Email */}
              <div className="flex justify-between items-center py-3 border-t border-gray-300">
                <span className="text-sm text-gray-600">Email</span>
                <span className="text-sm text-gray-900">
                  {orderData.customerEmail}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment summary — same layout as Buy Now checkout invoice */}
        {(() => {
          const pay = buildOrderPaymentBreakdown(orderData.rawData);
          if (!pay || pay.catalogSubtotal <= 0) return null;

          return (
            <PaymentSummaryCard
              subTotalBeforeDiscount={pay.catalogSubtotal}
              effectiveOutrightDiscount={pay.discount}
              outrightDiscountPct={pay.outrightDiscountPct}
              discountedSubTotal={pay.itemsAfterDiscount}
              deliveryFee={pay.delivery}
              installationFee={pay.installation}
              materialCost={pay.material}
              inspectionFee={pay.inspection}
              totalAmount={pay.totalAmount}
              vatAmount={pay.vat}
              vatPercent={pay.vatPct}
              insuranceAmount={pay.insurance}
              showInsurance={pay.insurance > 0}
              grandTotal={pay.orderTotal}
            />
          );
        })()}

        {/* Reviews — one rating per product or bundle in this order */}
        {canReviewOrder && hasReviewableItems ? (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Rate your items
            </h3>
            <div className="bg-white rounded-2xl p-4 border border-gray-400 space-y-4">
              {reviewableItems.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-2">
                  No products or bundles were found on this order to review.
                </p>
              ) : (
                reviewableItems.map((item) => {
                const target = { type: item.type, id: item.id };
                const key = reviewItemKey(item.type, item.id);
                const lineItem = Array.isArray(orderData.items)
                  ? orderData.items.find((line) => {
                      if (item.type === "bundle") {
                        return getBundleIdFromLineItem(line) === item.id;
                      }
                      return getProductIdFromLineItem(line) === item.id;
                    })
                  : null;
                const rev = reviewsByKey[key];
                return (
                  <div
                    key={key}
                    className="pb-4 border-b border-gray-200 last:border-b-0 last:pb-0"
                  >
                    {item.type === "bundle" ? (
                      <Link
                        to={`/productBundle/details/${item.id}`}
                        className="text-sm font-medium text-gray-900 mb-1 hover:text-[#273E8E] hover:underline block"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium text-gray-900 mb-1">
                        {item.title}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mb-2 capitalize">
                      {item.type === "bundle" ? "Solar bundle" : "Product"}
                    </p>
                    {rev ? (
                      <div className="mb-2 space-y-1">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              size={14}
                              className={
                                star <= rev.rating
                                  ? "text-[#273E8E] fill-current"
                                  : "text-gray-300"
                              }
                            />
                          ))}
                          <span className="text-xs text-gray-600 ml-1">
                            Your review
                          </span>
                        </div>
                        {rev.reviewText ? (
                          <p className="text-xs text-gray-700">{rev.reviewText}</p>
                        ) : null}
                        {rev.adminReply ? (
                          <div className="text-xs text-gray-800 mt-1 p-2 bg-[#f5f7ff] rounded-lg border border-[#273e8e]/20">
                            <span className="font-semibold text-[#273e8e]">
                              Troosolar
                            </span>
                            <p className="whitespace-pre-wrap mt-0.5">
                              {rev.adminReply}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {!rev ? (
                      <button
                        type="button"
                        onClick={() => openReviewModal(target, item.title, lineItem)}
                        className="text-sm font-medium text-[#273e8e] hover:text-[#1e327a] underline-offset-2 hover:underline"
                      >
                        {`Rate this ${item.type === "bundle" ? "bundle" : "product"}`}
                      </button>
                    ) : null}
                  </div>
                );
              })
              )}
            </div>
          </div>
        ) : null}

      </div>

      {/* Bottom hint */}
      <div className="sm:relative fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 p-4">
        <div className="sm:max-w-md sm:mx-auto">
          {hasReviewableItems ? (
            <p className="text-center text-sm text-gray-600 leading-relaxed">
              {canReviewOrder
                ? "Each product or bundle in this order can be rated separately above."
                : "Reviews are available after your order is delivered."}
            </p>
          ) : (
            <p className="text-center text-sm text-gray-600">
              {canReviewOrder
                ? "No reviewable items were found on this order."
                : "Reviews are available after your order is delivered."}
            </p>
          )}
        </div>
      </div>

      {/* Review Modal */}
      <ReviewModal
        isOpen={showReviewModal}
        onClose={closeReviewModal}
        onSubmit={handleReviewSubmit}
        loading={reviewLoading}
        error={reviewError}
        productTitle={reviewModalProductTitle}
      />
    </div>
  );
};

export default OrderSummary;
