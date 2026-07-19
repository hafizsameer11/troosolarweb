import React, { useEffect, useMemo, useState, useContext } from "react";
import axios from "axios";
import { LucideSquarePlus, ChevronLeft } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import CartItems from "../Component/CartItems";
import SideBar from "../Component/SideBar";
import { RxCrossCircled } from "react-icons/rx";
import { GiCheckMark } from "react-icons/gi";
import TopNavbar from "../Component/TopNavbar";
import API, { BASE_URL, FLUTTERWAVE_PUBLIC_KEY } from "../config/api.config";
import { ContextApi } from "../Context/AppContext";
import { loginPathWithReturn } from "../utils/authRedirect";
import { persistSessionFromCartAccess } from "../utils/cartAccessAuth";
import {
  BNPL_MIN_FALLBACK,
  BNPL_PROMO_COPY,
  fetchBnplMinimumLoanAmount,
} from "../utils/bnplEligibility";

// helpers
const toNumber = (v) =>
  typeof v === "number"
    ? v
    : Number(String(v ?? "").replace(/[^\d.]/g, "")) || 0;

// Turn BASE_URL (http://.../api) into origin (http://...)
const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, "");
const FALLBACK_IMAGE =
  "https://api.troosolar.com/storage/products/d5c7f116-57ed-46ef-a659-337c94c308a9.png";

const toAbsolute = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${API_ORIGIN}${path}`;
  const cleaned = String(path).replace(/^public\//, "");
  return `${API_ORIGIN}/storage/${cleaned}`;
};

const resolveCartLineImage = (model = {}) => {
  const fromGallery =
    Array.isArray(model.images) && model.images.length > 0
      ? model.images[0]?.image || model.images[0]?.url
      : null;

  const raw =
    model.featured_image_url ||
    model.featured_image ||
    model.image_url ||
    model.image ||
    model.thumbnail ||
    fromGallery ||
    "";

  const absolute = toAbsolute(raw);
  return absolute || FALLBACK_IMAGE;
};

const normalizeCartLineType = (rawType) => {
  const s = String(rawType || "");
  return /bundle/i.test(s) ? "bundle" : "product";
};

const formatDateLabel = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// Local storage key (set from Product Details page when you add to cart)
const INSTALL_MAP_KEY = "install_price_map";

// Map server cart item -> UI line
const mapCartItem = (ci) => {
  const model = ci?.itemable || {};
  const title = model.name || model.title || `Item #${ci?.itemable_id}`;
  const image = resolveCartLineImage(model);

  const serverUnit = toNumber(ci?.unit_price);
  const modelDiscount = toNumber(model.discount_price);
  const modelBase = toNumber(model.price ?? model.total_price);
  const modelEffective = modelDiscount > 0 ? modelDiscount : modelBase;
  const unit = serverUnit > 0 ? serverUnit : modelEffective;
  const qty = toNumber(ci?.quantity);
  const subtotal = toNumber(ci?.subtotal ?? unit * qty);

  // Try to read a per-unit installation price from the item itself
  const installUnitFromModel = toNumber(
    model.installation_price ?? model.install_price ?? model.installation_cost
  );

  return {
    cartLineId: ci.id,
    refId: ci.itemable_id,
    type: normalizeCartLineType(ci.type || ci.itemable_type),
    name: title,
    image,
    qty,
    unitPrice: unit,
    subtotal,
    installUnit: installUnitFromModel,
  };
};

// ---- Delivery Address endpoints
const ADDR_STORE = `${BASE_URL}/delivery-address/store`;
const ADDR_SHOW = (id) => `${BASE_URL}/delivery-address/show/${id}`;
const ADDR_UPDATE = (id) => `${BASE_URL}/delivery-address/update/${id}`;

const ADDR_CACHE_KEY = "addresses_cache";
const ADDR_SELECTED_KEY = "selected_address_id";

const parseAddressFromResponse = (resp) => {
  const d = resp ?? {};
  if (d.data && typeof d.data === "object" && !Array.isArray(d.data))
    return d.data;
  if (
    d.message &&
    typeof d.message === "object" &&
    !Array.isArray(d.message)
  )
    return d.message;
  return null;
};

/** Normalized list from GET /delivery-address/index (fixes legacy responses). */
const parseAddressListFromResponse = (resp) => {
  if (!resp) return [];
  if (Array.isArray(resp.data)) return resp.data;
  // Legacy bug: addresses were returned under `message`
  if (Array.isArray(resp.message)) return resp.message;
  return [];
};

const ADDR_INDEX =
  API.Get_All_Addresses || `${BASE_URL}/delivery-address/index`;
const minInstallationDateStr = () => {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Fallbacks if not present in api.config.js
const CHECKOUT_SUMMARY_URL =
  API.CART_CHECKOUT_SUMMARY || `${BASE_URL}/cart/checkout-summary`;
const ORDERS_URL = API.ORDERS || `${BASE_URL}/orders`;
const PAYMENT_CONFIRMATION_URL =
  API.Payment_Confirmation || `${BASE_URL}/order/payment-confirmation`;

/** Cart checkout uses Flutterwave only (API expects flutterwave_transaction_id on POST /orders). */
const CART_PAYMENT_METHOD = "direct";

// Flutterwave integration
const ensureFlutterwave = () =>
  new Promise((resolve, reject) => {
    if (window.FlutterwaveCheckout) return resolve();
    const s = document.createElement("script");
    s.src = "https://checkout.flutterwave.com/v3.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Flutterwave script"));
    document.body.appendChild(s);
  });

// Small helper to render a “Title ─────” line style
const SectionHeading = ({ children }) => (
  <div className="flex items-center gap-3">
    <p className="text-sm font-medium text-[#1F2348]">{children}</p>
    <div className="flex-1 h-[1px] bg-[#E7E8F2]" />
  </div>
);

const Cart = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { fetchCartCount } = useContext(ContextApi);

  // desktop flags
  const [checkout, setCheckOut] = useState(true);
  const [checkoutPayment, setCheckOutPayment] = useState(false);

  // NEW: mobile step state ("cart" | "delivery" | "summary" | "result")
  const [mobileStep, setMobileStep] = useState("cart");

  // NEW: payment result for mobile ("success" | "failed" | null)
  const [paymentResult, setPaymentResult] = useState(null);

  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // addresses
  const [addresses, setAddresses] = useState([]);
  const [openPicker, setOpenPicker] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [selectedAddress, setSelectedAddress] = useState(null);

  // add/edit address
  const [addingNew, setAddingNew] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [newForm, setNewForm] = useState({
    title: "",
    contact_name: "",
    address: "",
    state: "",
    phone_number: "",
  });

  const [editingId, setEditingId] = useState(null);
  const [editingForm, setEditingForm] = useState({
    title: "",
    contact_name: "",
    address: "",
    state: "",
    phone_number: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // checkout summary states
  const [summaryLoading, setSummaryLoading] = useState(false);
  /** null = checkout summary not loaded yet (avoid falsy 0 vs real ₦0). */
  const [serverItemsTotal, setServerItemsTotal] = useState(null);
  const [serverItemsCount, setServerItemsCount] = useState(null);
  const [serverDeliveryPrice, setServerDeliveryPrice] = useState(0);
  const [serverInstallPrice, setServerInstallPrice] = useState(0);
  const [serverInsurancePrice, setServerInsurancePrice] = useState(0);
  const [bnplMinimumAmount, setBnplMinimumAmount] = useState(BNPL_MIN_FALLBACK);
  const [deliveryEstimateLabel, setDeliveryEstimateLabel] = useState(
    "7–10 working days"
  );
  const [serverGrandTotal, setServerGrandTotal] = useState(null);
  const [serverVatAmount, setServerVatAmount] = useState(0);
  const [serverVatPct, setServerVatPct] = useState(0);
  const [serverInsurancePct, setServerInsurancePct] = useState(0);
  /** From checkout-summary cart lines when referral outright % applies (direct checkout). */
  const [serverReferralOutrightPct, setServerReferralOutrightPct] = useState(0);
  const [installationNotice, setInstallationNotice] = useState("");
  const [type, setType] = useState("product");
  const [typeByRefId, setTypeByRefId] = useState(new Map());

  // place order / payment
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderData, setOrderData] = useState(null);
  const [processingPayment, setProcessingPayment] = useState(false);

  // Add installation toggle state
  const [includeInstallation, setIncludeInstallation] = useState(false);
  const [serverInstallEstimatedDate, setServerInstallEstimatedDate] = useState("");
  /** YYYY-MM-DD when user opts in to Troosolar installation (sent on payment confirm). */
  const [installationRequestedDate, setInstallationRequestedDate] = useState("");

  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  // ─────────────────────────────
  // Cart: fetch
  // ─────────────────────────────
  const loadCart = async () => {
    const authToken =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;
    if (!authToken) {
      setErr("Please log in to view your cart.");
      setLines([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setErr("");
      const { data } = await axios.get(API.CART, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${authToken}`,
        },
      });
      const list = Array.isArray(data?.data) ? data.data : [];
      let mapped = list.map(mapCartItem);

      // Backfill installUnit from localStorage (saved by Product Details add-to-cart)
      try {
        const m = JSON.parse(localStorage.getItem(INSTALL_MAP_KEY) || "{}");
        mapped = mapped.map((l) => ({
          ...l,
          installUnit: l.installUnit || toNumber(m?.[String(l.refId)]),
        }));
      } catch {
        /* ignore */
      }

      setLines(mapped);
      // Invalidate server checkout totals — next summary fetch will match new lines.
      setServerItemsTotal(null);
      setServerItemsCount(null);
      setServerGrandTotal(null);
      setServerReferralOutrightPct(0);
    } catch (e) {
      setErr(
        e?.response?.data?.message || e?.message || "Failed to load cart."
      );
      setLines([]);
      setServerItemsTotal(null);
      setServerItemsCount(null);
      setServerGrandTotal(null);
      setServerReferralOutrightPct(0);
    } finally {
      setLoading(false);
    }
  };

  const persistAddresses = (arr) => {
    setAddresses(arr);
    try {
      localStorage.setItem(ADDR_CACHE_KEY, JSON.stringify(arr));
    } catch {
      /* ignore */
    }
  };

  const setSelected = (id, addr) => {
    setSelectedAddressId(id);
    setSelectedAddress(addr);
    try {
      if (id) localStorage.setItem(ADDR_SELECTED_KEY, String(id));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchBnplMinimumLoanAmount(token).then((min) => {
      if (!cancelled) setBnplMinimumAmount(min);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Custom order email links: /cart?token=…&type=buy_now|bnpl (legacy buy_now → Buy Now flow)
  useEffect(() => {
    const accessToken = searchParams.get("token");
    const orderType = searchParams.get("type");
    if (!accessToken || (orderType !== "buy_now" && orderType !== "bnpl")) {
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const userToken = localStorage.getItem("access_token");
        const { data } = await axios.get(API.CART_ACCESS(accessToken), {
          headers: {
            Accept: "application/json",
            ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
          },
        });
        if (cancelled) return;
        if (data?.status !== "success") {
          setErr(data?.message || "Invalid or expired cart link");
          setLoading(false);
          return;
        }
        const payload = data.data;
        persistSessionFromCartAccess(payload);
        if (payload?.requires_login) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("user");
          const returnPath =
            orderType === "buy_now"
              ? `/buy-now?token=${encodeURIComponent(accessToken)}&type=buy_now&step=4`
              : `/cart?token=${encodeURIComponent(accessToken)}&type=${encodeURIComponent(orderType)}`;
          navigate(loginPathWithReturn(returnPath), { replace: true });
          return;
        }
        if (orderType === "bnpl") {
          navigate(
            `/bnpl?token=${encodeURIComponent(accessToken)}&type=bnpl`,
            { replace: true }
          );
          return;
        }
        // Buy Now custom orders: continue in Buy Now after product/bundle selection
        navigate(
          `/buy-now?token=${encodeURIComponent(accessToken)}&type=buy_now&step=4`,
          { replace: true }
        );
      } catch (e) {
        if (!cancelled) {
          setErr(
            e?.response?.data?.message ||
              e?.message ||
              "Invalid or expired cart link"
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate]);

  useEffect(() => {
    if (searchParams.get("token")) return;
    loadCart();
    const syncAddresses = async () => {
      if (!token) {
        try {
          const raw = localStorage.getItem(ADDR_CACHE_KEY);
          const arr = raw ? JSON.parse(raw) : [];
          if (Array.isArray(arr)) setAddresses(arr);
        } catch {
          /* ignore */
        }
        return;
      }
      try {
        const { data } = await axios.get(ADDR_INDEX, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const list = parseAddressListFromResponse(data);
        if (list.length) {
          persistAddresses(list);
          const selId = localStorage.getItem(ADDR_SELECTED_KEY);
          const match = selId
            ? list.find((a) => String(a.id) === String(selId))
            : null;
          if (match) {
            setSelected(String(match.id), match);
          } else {
            try {
              localStorage.removeItem(ADDR_SELECTED_KEY);
            } catch {
              /* ignore */
            }
            setSelectedAddressId(null);
            setSelectedAddress(null);
          }
        } else {
          persistAddresses([]);
          try {
            localStorage.removeItem(ADDR_SELECTED_KEY);
          } catch {
            /* ignore */
          }
          setSelectedAddressId(null);
          setSelectedAddress(null);
        }
      } catch {
        try {
          const raw = localStorage.getItem(ADDR_CACHE_KEY);
          const arr = raw ? JSON.parse(raw) : [];
          if (Array.isArray(arr)) setAddresses(arr);
        } catch {
          /* ignore */
        }
      }
    };
    void syncAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAndSelect = async (id) => {
    if (!token || !id) return;
    try {
      const { data } = await axios.get(ADDR_SHOW(id), {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const addr = parseAddressFromResponse(data);
      if (addr && addr.id) {
        const updated = (() => {
          const copy = [...addresses];
          const idx = copy.findIndex((a) => String(a.id) === String(addr.id));
          if (idx >= 0) copy[idx] = addr;
          else copy.push(addr);
          return copy;
        })();
        persistAddresses(updated);
        setSelected(String(addr.id), addr);
      }
    } catch (e) {
      const st = e?.response?.status;
      if (st === 404 || st === 400) {
        try {
          localStorage.removeItem(ADDR_SELECTED_KEY);
        } catch {
          /* ignore */
        }
        setSelectedAddressId(null);
        setSelectedAddress(null);
      }
    }
  };
  const normalizeTypeForOrder = (t) => {
    const s = String(t || "");
    if (/bundle/i.test(s)) return "Bundles"; // match "Bundles"
    if (/product/i.test(s)) return "Product"; // match "Product"
    return "Product"; // safe default
  };

  // ─────────────────────────────
  // Address: add / edit
  // ─────────────────────────────
  const saveNew = async () => {
    if (!token) return;
    if (
      !newForm.title ||
      !newForm.address ||
      !newForm.state ||
      !newForm.phone_number
    ) {
      alert("Please fill all fields.");
      return;
    }
    setSavingNew(true);
    try {
      const { data } = await axios.post(
        ADDR_STORE,
        { ...newForm },
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const addr = parseAddressFromResponse(data);
      if (addr && addr.id) {
        const updated = [...addresses, addr];
        persistAddresses(updated);
        setSelected(String(addr.id), addr);
        setAddingNew(false);
        setNewForm({
          title: "",
          contact_name: "",
          address: "",
          state: "",
          phone_number: "",
        });
      } else {
        alert("Address saved, but could not parse response.");
      }
    } catch (e) {
      alert(
        e?.response?.data?.message || e?.message || "Failed to add address"
      );
    } finally {
      setSavingNew(false);
    }
  };

  const selectExisting = (id) => {
    const found = addresses.find((a) => String(a.id) === String(id));
    setSelected(String(id), found || null);
    void fetchAndSelect(id);
  };

  const startEdit = (a) => {
    setEditingId(a.id);
    setEditingForm({
      title: a.title || "",
      contact_name: a.contact_name || "",
      address: a.address || "",
      state: a.state || "",
      phone_number: a.phone_number || "",
    });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setSavingEdit(false);
  };
  const saveEdit = async () => {
    if (!token || !editingId) return;
    setSavingEdit(true);
    try {
      const { data } = await axios.put(
        ADDR_UPDATE(editingId),
        { ...editingForm },
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const addr = parseAddressFromResponse(data) || {
        id: editingId,
        ...editingForm,
      };
      const updated = addresses.map((a) =>
        String(a.id) === String(editingId) ? { ...a, ...addr } : a
      );
      persistAddresses(updated);
      if (String(selectedAddressId) === String(editingId)) {
        setSelected(
          String(editingId),
          updated.find((a) => String(a.id) === String(editingId)) || addr
        );
      }
      setEditingId(null);
    } catch (e) {
      const st = e?.response?.status;
      if (st === 404 || st === 400) {
        try {
          localStorage.removeItem(ADDR_SELECTED_KEY);
        } catch {
          /* ignore */
        }
        setSelectedAddressId(null);
        setSelectedAddress(null);
        setEditingId(null);
        persistAddresses(
          addresses.filter((a) => String(a.id) !== String(editingId))
        );
      }
      alert(
        e?.response?.data?.message || e?.message || "Failed to update address"
      );
    } finally {
      setSavingEdit(false);
    }
  };

  // ─────────────────────────────
  // Cart: qty handlers
  // ─────────────────────────────
  const updateQty = async (cartLineId, newQty) => {
    if (!token) return;
    if (newQty <= 0) {
      await removeLine(cartLineId);
      return;
    }
    try {
      await axios.put(
        API.CART_ITEM(cartLineId),
        { quantity: newQty },
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      setLines((prev) =>
        prev.map((l) =>
          l.cartLineId === cartLineId
            ? { ...l, qty: newQty, subtotal: newQty * l.unitPrice }
            : l
        )
      );
      // Refresh global cart count
      fetchCartCount();
    } catch {
      alert(
        "Unable to update quantity. Requested quantity is higher than available stock."
      );
      await loadCart();
    }
  };

  const increment = (cartLineId) => {
    const line = lines.find((l) => l.cartLineId === cartLineId);
    if (!line) return;
    updateQty(cartLineId, line.qty + 1);
  };

  const decrement = (cartLineId) => {
    const line = lines.find((l) => l.cartLineId === cartLineId);
    if (!line) return;
    updateQty(cartLineId, line.qty - 1);
  };

  const removeLine = async (cartLineId) => {
    if (!token) return;
    try {
      await axios.delete(API.CART_ITEM(cartLineId), {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      setLines((prev) => prev.filter((l) => l.cartLineId !== cartLineId));
      // Refresh global cart count
      fetchCartCount();
    } catch {
      await loadCart();
    }
  };
  // Totals (local)
  const itemCount = useMemo(
    () => lines.reduce((s, l) => s + l.qty, 0),
    [lines]
  );
  const amountTotal = useMemo(
    () => lines.reduce((s, l) => s + l.subtotal, 0),
    [lines]
  );

  // Keep local installation computation for backward compatibility only.
  const installationTotal = useMemo(
    () =>
      lines.reduce((s, l) => s + toNumber(l.installUnit) * toNumber(l.qty), 0),
    [lines]
  );

  // Prefer server items_total once checkout-summary has been fetched (matches admin VAT/delivery/insurance rules).
  const itemsTotalToShow =
    serverItemsTotal != null && !Number.isNaN(Number(serverItemsTotal))
      ? Number(serverItemsTotal)
      : amountTotal;
  /** Sum of cart line prices (matches product cards). */
  const itemsCatalogSubtotal = amountTotal;
  /** Amount used for fees/VAT (after referral discount when direct). */
  const itemsChargedSubtotal = itemsTotalToShow;
  let outrightDiscountAmount = 0;
  if (
    serverItemsTotal != null &&
    !Number.isNaN(Number(serverItemsTotal))
  ) {
    const cat = Number(amountTotal);
    const ch = Number(serverItemsTotal);
    if (ch < cat - 0.5) {
      outrightDiscountAmount = Math.round((cat - ch) * 100) / 100;
    }
  }
  const showOutrightDiscountRow = outrightDiscountAmount > 0.5;
  const outrightDiscountLabel =
    serverReferralOutrightPct > 0
      ? `Online checkout discount (${Number(serverReferralOutrightPct)}%)`
      : "Online checkout discount";

  const installationToShow = serverInstallPrice || 0;
  const insuranceToShow = serverInsurancePrice || 0;
  const deliveryToShow = serverDeliveryPrice || 0;
  /** Backend includes VAT in grand_total; fallback sums pre-VAT when summary not loaded */
  const grandTotal = useMemo(() => {
    if (
      serverGrandTotal != null &&
      !Number.isNaN(Number(serverGrandTotal))
    ) {
      return Number(serverGrandTotal);
    }
    const preVat =
      itemsTotalToShow +
      deliveryToShow +
      (includeInstallation ? installationToShow + insuranceToShow : 0);
    const vat =
      serverVatAmount != null && !Number.isNaN(Number(serverVatAmount))
        ? Number(serverVatAmount)
        : 0;
    return preVat + vat;
  }, [
    serverGrandTotal,
    itemsTotalToShow,
    deliveryToShow,
    includeInstallation,
    installationToShow,
    insuranceToShow,
    serverVatAmount,
  ]);

  const firstLine = lines[0];

  // ─────────────────────────────
  // Checkout summary
  // ─────────────────────────────
  const fetchCheckoutSummary = async (includeInstallOverride) => {
    if (!token) return;
    const includeFlag =
      typeof includeInstallOverride === "boolean"
        ? includeInstallOverride
        : includeInstallation;
    setSummaryLoading(true);
    try {
      const res = await axios.get(CHECKOUT_SUMMARY_URL, {
        params: {
          include_installation: includeFlag ? 1 : 0,
          payment_method: CART_PAYMENT_METHOD,
        },
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = res?.data?.data || res?.data || {};
      const cart = payload.cart || {};
      const addressesArr = Array.isArray(payload.addresses)
        ? payload.addresses
        : [];
      const delivery = payload.delivery || {};
      const installation = payload.installation || {};
      const totals = payload.totals || {};

      setServerItemsTotal(toNumber(cart.items_total));
      setServerItemsCount(toNumber(cart.items_count));
      {
        let pct = 0;
        if (Array.isArray(cart.items)) {
          const hit = cart.items.find(
            (i) => toNumber(i.referral_outright_discount_percent) > 0
          );
          if (hit) {
            pct = toNumber(hit.referral_outright_discount_percent);
          }
        }
        setServerReferralOutrightPct(pct);
      }
      setServerDeliveryPrice(toNumber(delivery.price));
      setServerInstallPrice(toNumber(installation.price));
      setServerInsurancePrice(toNumber(installation.insurance_price));
      setDeliveryEstimateLabel(
        delivery.estimate_label || "7–10 working days"
      );
      setServerInstallEstimatedDate(installation.estimated_date || "");
      const g = toNumber(totals.grand_total ?? payload.grand_total);
      setServerGrandTotal(g);
      setServerVatAmount(toNumber(totals.vat_amount));
      setServerVatPct(toNumber(totals.vat_percentage));
      setServerInsurancePct(toNumber(totals.insurance_fee_percentage));
      setInstallationNotice(
        String(installation.description || "").trim()
      );
      setType(cart.type);

      // Build type mapping from checkout summary items
      const newTypeMap = new Map();
      if (Array.isArray(cart.items)) {
        cart.items.forEach((item) => {
          if (item.ref_id && item.type) {
            newTypeMap.set(String(item.ref_id), item.type);
          }
        });
      }
      setTypeByRefId(newTypeMap);

      if (addressesArr.length) {
        const merged = (() => {
          const byId = new Map(addresses.map((a) => [String(a.id), a]));
          addressesArr.forEach((a) => {
            if (!byId.has(String(a.id))) byId.set(String(a.id), a);
          });
          return Array.from(byId.values());
        })();
        persistAddresses(merged);
        const sel = selectedAddressId;
        let effectiveSel = sel;
        if (sel && !merged.some((a) => String(a.id) === String(sel))) {
          try {
            localStorage.removeItem(ADDR_SELECTED_KEY);
          } catch {
            /* ignore */
          }
          setSelectedAddressId(null);
          setSelectedAddress(null);
          effectiveSel = null;
        }
        if (!effectiveSel && merged[0]?.id) {
          setSelected(String(merged[0].id), merged[0]);
        } else if (
          effectiveSel &&
          merged.some((a) => String(a.id) === String(effectiveSel))
        ) {
          const addr = merged.find(
            (a) => String(a.id) === String(effectiveSel)
          );
          if (addr) setSelected(String(effectiveSel), addr);
        }
      }
    } catch (e) {
      console.error("Checkout summary failed:", e?.response?.data || e);
      setServerItemsTotal(null);
      setServerItemsCount(null);
      setServerGrandTotal(null);
      setServerReferralOutrightPct(0);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleCheckoutClick = () => {
    setCheckOut(false); // desktop: delivery column — summary refetched via effect below
  };

  // Keep checkout-summary in sync with cart lines, payment method, installation toggle, and desktop/mobile checkout steps.
  useEffect(() => {
    if (!token || !lines.length) return;
    const desktopCheckoutOpen = !checkout;
    const mobilePastCart =
      mobileStep === "delivery" || mobileStep === "summary";
    if (!desktopCheckoutOpen && !mobilePastCart) return;
    void fetchCheckoutSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchCheckoutSummary closes over latest flags
  }, [
    lines,
    checkout,
    mobileStep,
    includeInstallation,
    token,
  ]);

  const installationDateOk = () => {
    if (!includeInstallation) return true;
    if (!installationRequestedDate) {
      alert("Please choose a preferred installation date.");
      return false;
    }
    return true;
  };

  /** Shared payload for POST /orders (cart checkout). */
  const buildCartOrderBody = () => ({
    delivery_address_id: Number(selectedAddressId),
    payment_method: CART_PAYMENT_METHOD,
    items: lines.map((l) => {
      const typeForOrder =
        typeByRefId.get(String(l.refId)) || normalizeTypeForOrder(l.type);
      return {
        itemable_type: typeForOrder,
        itemable_id: Number(l.refId),
        quantity: Number(l.qty) || 1,
      };
    }),
    include_installation: includeInstallation,
    ...(includeInstallation && installationRequestedDate
      ? { installation_requested_date: installationRequestedDate }
      : {}),
  });

  // ─────────────────────────────
  // Payment Confirmation
  // ─────────────────────────────
  const confirmPayment = async (
    orderId,
    txId,
    amount,
    type = "direct",
    installDate = null
  ) => {
    if (!token) return false;
    try {
      const body = {
        amount: String(amount),
        orderId: Number(orderId),
        txId: String(txId ?? ""),
        type,
      };
      if (installDate && /^\d{4}-\d{2}-\d{2}$/.test(installDate)) {
        body.installation_requested_date = installDate;
      }
      const { data } = await axios.post(PAYMENT_CONFIRMATION_URL, body, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      return data?.status === "success";
    } catch (e) {
      console.error("Payment confirmation failed:", e);
      return false;
    }
  };

  // ─────────────────────────────
  // Flutterwave Payment
  // ─────────────────────────────
  // ─────────────────────────────
  // Flutterwave Payment (fixed to ALWAYS show mobile result page)
  // ─────────────────────────────
  /**
   * Flutterwave first; order is created only after successful charge (direct checkout).
   * @param options.onSuccessfulCharge — required for cart: POST /orders with flutterwave_transaction_id
   * @param options.legacyOrderId — optional: old flow (order already exists) + paymentConfirmation
   */
  const startFlutterwavePayment = async (amount, options = {}) => {
    const { onSuccessfulCharge, legacyOrderId } = options;
    const installDate =
      includeInstallation && installationRequestedDate
        ? installationRequestedDate
        : null;
    try {
      setProcessingPayment(true);
      await ensureFlutterwave();

      const isSmallScreen =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 639px)").matches;

      const goToResult = (status /* 'success' | 'failed' */) => {
        setPaymentResult(status);
        setMobileStep("result");
        if (!isSmallScreen) {
          setCheckOutPayment(true);
        }
      };

      const txRef = "txref_" + Date.now();

      await new Promise((resolve) => {
        window.FlutterwaveCheckout({
          public_key: FLUTTERWAVE_PUBLIC_KEY,
          tx_ref: txRef,
          amount,
          currency: "NGN",
          payment_options: "card,ussd,banktransfer",
          customer: { email: "test@example.com", name: "Test User" },
          callback: async (response) => {
            try {
              if (response?.status === "successful") {
                if (typeof window.closePaymentModal === "function") {
                  window.closePaymentModal();
                }
                if (typeof onSuccessfulCharge === "function") {
                  await onSuccessfulCharge(response);
                  fetchCartCount();
                  goToResult("success");
                } else if (legacyOrderId) {
                  const confirmed = await confirmPayment(
                    legacyOrderId,
                    response.transaction_id,
                    amount,
                    "direct",
                    installDate
                  );
                  if (confirmed) {
                    fetchCartCount();
                    goToResult("success");
                  } else {
                    console.error(
                      "Payment confirmation failed for order:",
                      legacyOrderId
                    );
                    alert(
                      "Payment verification failed. Please contact support if amount was debited."
                    );
                    goToResult("failed");
                  }
                } else {
                  goToResult("failed");
                }
              } else {
                console.error("Flutterwave payment failed:", response);
                goToResult("failed");
              }
            } catch (err) {
              console.error(err);
              alert(
                err?.message ||
                  "Something went wrong after payment. If you were charged, contact support with your reference."
              );
              goToResult("failed");
            } finally {
              setProcessingPayment(false);
              resolve();
            }
          },
          onclose: () => {
            setProcessingPayment(false);
            resolve();
          },
          customizations: {
            title: "Troosolar Payment",
            description: legacyOrderId
              ? `Order ID: ${orderData?.order_number || legacyOrderId}`
              : "Complete your purchase",
            logo: "https://yourdomain.com/logo.png",
          },
        });
      });
    } catch (e) {
      console.error("Payment init failed:", e);
      setProcessingPayment(false);
      alert("Failed to initialize payment. Please try again.");
    }
  };

  /** BNPL: full flow lives under /bnpl — open invoice (6.75) then loan calculator. */
  const handleBuyByLoan = () => {
    if (!token) {
      alert("Please log in first.");
      navigate(
        `/login?return=${encodeURIComponent("/bnpl?fromCart=1&step=6.75")}`
      );
      return;
    }
    const total = Number(grandTotal) || 0;
    if (total < bnplMinimumAmount) {
      alert(
        `Buy Now, Pay Later is only available for orders from ₦${bnplMinimumAmount.toLocaleString()}. Your cart total is ₦${total.toLocaleString()}. Add more items or proceed to checkout.`
      );
      return;
    }
    if (lines.length === 0) {
      alert("Your cart is empty.");
      return;
    }
    navigate("/bnpl?fromCart=1&step=6.75");
  };

  const showBnplButton =
    lines.length > 0 && Number(grandTotal) >= bnplMinimumAmount;

  // ─────────────────────────────
  // Place Order (desktop: submit + pay)
  // ─────────────────────────────
  const handlePlaceOrder = async () => {
    if (!token) return alert("Please log in first.");
    if (!selectedAddressId) {
      setOpenPicker(true);
      alert(
        "Please select or add a delivery address before placing the order."
      );
      return;
    }
    if (!installationDateOk()) return;
    if (lines.length === 0) return alert("Your cart is empty.");

    const orderBody = buildCartOrderBody();
    console.log("itemsPayload →", orderBody.items);

    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    };

    setPlacingOrder(true);
    try {
      const payAmount = Number(grandTotal) || 0;
      if (payAmount <= 0) {
        alert("Invalid order total. Refresh checkout and try again.");
        return;
      }
      await startFlutterwavePayment(payAmount, {
        onSuccessfulCharge: async (fwResponse) => {
          const txId = String(
            fwResponse.transaction_id ?? fwResponse.id ?? ""
          ).trim();
          if (!txId) {
            throw new Error("Missing payment reference from gateway.");
          }
          const { data } = await axios.post(
            ORDERS_URL,
            { ...orderBody, flutterwave_transaction_id: txId },
            { headers }
          );
          if (data?.status !== "success" || !data?.data) {
            throw new Error(
              data?.message ||
                "Could not create your order after payment. Contact support with your transaction reference."
            );
          }
          setOrderData(data.data);
        },
      });
    } catch (e) {
      const msg =
        e?.response?.data?.message || e?.message || "Failed to place order.";
      alert(msg);
    } finally {
      setPlacingOrder(false);
    }
  };

  // ─────────────────────────────
  // Place Order (MOBILE: create only → go to Summary)
  // ─────────────────────────────
  const handleCreateOrderMobile = () => {
    if (!token) {
      alert("Please log in first.");
      return;
    }
    if (!selectedAddressId) {
      setOpenPicker(true);
      alert("Please select or add a delivery address.");
      return;
    }
    if (!installationDateOk()) return;
    if (lines.length === 0) {
      alert("Your cart is empty.");
      return;
    }
    setMobileStep("summary");
  };

  /* =========================
     DESKTOP (unchanged UI)
     ========================= */
  return (
    <>
      {/* DESKTOP — keep your existing layout exactly (sm+ only) */}
      <div className="sm:flex hidden min-h-screen w-full bg-[#F5F7FF]">
        <SideBar />

        <main className="flex flex-col w-full">
          <TopNavbar />

          <section className="flex flex-col lg:flex-row justify-between gap-5 px-5 py-5 w-full">
            {/* Cart Items */}
            <div className="w-full sm:w-[57%] space-y-4 p-5">
              <h1 className="text-2xl">Shopping Cart</h1>
              <Link
                to="/homePage?from=cart#catalog-products"
                className="text-blue-500 underline text-sm hover:text-blue-700"
              >
                Continue shopping
              </Link>

              <div className="px-4 p-2 text-xs rounded-xl bg-[#e0e4f3] text-[#273e8e] border-dashed border-[1.2px] my-3 border-[#273e8e]">
                <p>
                  With product builder, you can order custom solar products{" "}
                  <br />
                  to fully suit your needs
                </p>
              </div>

              <Link to="/homePage?from=cart#catalog-products">
                <div className="px-4 p-2 text-xs rounded-xl bg-[#fff] py-4 flex justify-between items-center border-[1.2px] my-3 border-gray-400 hover:border-[#273e8e] hover:bg-[#f8faff] transition-colors cursor-pointer">
                  <p className="">Add more products</p>
                  <LucideSquarePlus />
                </div>
              </Link>

              {loading ? (
                <div className="px-4 p-4 text-sm rounded-xl bg-white border text-gray-500">
                  Loading…
                </div>
              ) : err ? (
                <div className="px-4 p-4 text-sm rounded-xl bg-white border text-red-600">
                  {err}
                </div>
              ) : lines.length === 0 ? (
                <div className="px-4 p-4 text-sm rounded-xl bg-white border text-gray-500">
                  Your cart is empty.
                </div>
              ) : (
                lines.map((line) => (
                  <CartItems
                    key={line.cartLineId}
                    itemId={line.cartLineId}
                    productId={line.refId}
                    name={line.name}
                    price={line.unitPrice}
                    image={line.image}
                    showControls={true}
                    quantity={line.qty}
                    onIncrement={increment}
                    onDecrement={decrement}
                    onDelete={removeLine}
                    linkPath={
                      line.type === "bundle" 
                        ? `/productBundle/details/${line.refId}`
                        : `/homePage/product/${line.refId}`
                    }
                  />
                ))
              )}
            </div>

            {/* Right Side: Order Summary or Delivery Section */}
            {checkout ? (
              <div className="w-full lg:w-1/2 p-5 mt-16 space-y-5">
                <h2 className="text-2xl ">Order Summary</h2>

                <div className="rounded-2xl bg-white p-5 space-y-3 border-[1px] border-gray-300">
                  <div className="flex justify-between text-gray-600">
                    <span className="text-xs text-gray-400">Items</span>
                    <span className="text-gray-500">{itemCount}</span>
                  </div>
                  <hr className="border-gray-300" />
                  <div className="flex justify-between text-[#273e8e]">
                    <span className="text-xs text-gray-400 ">Total</span>
                    <span className="font-semibold">
                      ₦{amountTotal.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={handleCheckoutClick}
                    className="py-4 bg-[#273e8e] text-white rounded-full text-sm hover:bg-[#1f2f6e] transition disabled:opacity-60"
                    disabled={lines.length === 0}
                  >
                    Checkout
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full lg:w-1/2 p-5 mt-16 space-y-6">
                <h2 className="text-2xl font-semibold">Delivery Details</h2>

                <div className="bg-white border-[1px] border-gray-300 rounded-2xl p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Delivery Address</span>
                    <button
                      type="button"
                      onClick={() => setOpenPicker((s) => !s)}
                      className="text-sm text-[#273E8E] hover:text-[#1d3c73] underline p-2 cursor-pointer"
                    >
                      {summaryLoading ? "Loading…" : "Change"}
                    </button>
                  </div>
                  <hr className="border-gray-300" />

                  {openPicker && (
                    <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                      {addresses.length ? (
                        <div className="space-y-2">
                          {addresses.map((a) => (
                            <div key={a.id} className="border rounded-md p-2">
                              <label className="flex items-start gap-2">
                                <input
                                  type="radio"
                                  name="deliveryAddress"
                                  checked={
                                    String(selectedAddressId) === String(a.id)
                                  }
                                  onChange={() => selectExisting(a.id)}
                                />
                                <div className="flex-1">
                                  <div className="text-sm font-medium">
                                    {a.contact_name || a.title}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {a.title}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    {a.address}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    {a.state} — {a.phone_number}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => startEdit(a)}
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  Edit
                                </button>
                              </label>

                              {editingId === a.id && (
                                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <input
                                    className="border rounded px-2 py-1 text-sm"
                                    placeholder="Title"
                                    value={editingForm.title}
                                    onChange={(e) =>
                                      setEditingForm((f) => ({
                                        ...f,
                                        title: e.target.value,
                                      }))
                                    }
                                  />
                                  <input
                                    className="border rounded px-2 py-1 text-sm"
                                    placeholder="Contact name"
                                    value={editingForm.contact_name}
                                    onChange={(e) =>
                                      setEditingForm((f) => ({
                                        ...f,
                                        contact_name: e.target.value,
                                      }))
                                    }
                                  />
                                  <input
                                    className="border rounded px-2 py-1 text-sm"
                                    placeholder="State"
                                    value={editingForm.state}
                                    onChange={(e) =>
                                      setEditingForm((f) => ({
                                        ...f,
                                        state: e.target.value,
                                      }))
                                    }
                                  />
                                  <input
                                    className="border rounded px-2 py-1 text-sm md:col-span-2"
                                    placeholder="Address"
                                    value={editingForm.address}
                                    onChange={(e) =>
                                      setEditingForm((f) => ({
                                        ...f,
                                        address: e.target.value,
                                      }))
                                    }
                                  />
                                  <input
                                    className="border rounded px-2 py-1 text-sm md:col-span-2"
                                    placeholder="Phone Number"
                                    value={editingForm.phone_number}
                                    onChange={(e) =>
                                      setEditingForm((f) => ({
                                        ...f,
                                        phone_number: e.target.value,
                                      }))
                                    }
                                  />
                                  <div className="flex gap-2 mt-1 md:col-span-2">
                                    <button
                                      type="button"
                                      onClick={saveEdit}
                                      className="px-3 py-1 rounded-full bg-[#273e8e] text-white text-xs disabled:opacity-60"
                                      disabled={savingEdit}
                                    >
                                      {savingEdit ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEdit}
                                      className="px-3 py-1 rounded-full border text-xs"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">
                          No addresses yet.
                        </div>
                      )}

                      {!addingNew ? (
                        <button
                          type="button"
                          onClick={() => setAddingNew(true)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          + Add new address
                        </button>
                      ) : (
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                          <input
                            className="border rounded px-2 py-1 text-sm"
                            placeholder="Title (e.g., Home, Office)"
                            value={newForm.title}
                            onChange={(e) =>
                              setNewForm((f) => ({
                                ...f,
                                title: e.target.value,
                              }))
                            }
                          />
                          <input
                            className="border rounded px-2 py-1 text-sm"
                            placeholder="Contact name"
                            value={newForm.contact_name}
                            onChange={(e) =>
                              setNewForm((f) => ({
                                ...f,
                                contact_name: e.target.value,
                              }))
                            }
                          />
                          <input
                            className="border rounded px-2 py-1 text-sm"
                            placeholder="State"
                            value={newForm.state}
                            onChange={(e) =>
                              setNewForm((f) => ({
                                ...f,
                                state: e.target.value,
                              }))
                            }
                          />
                          <input
                            className="border rounded px-2 py-1 text-sm md:col-span-2"
                            placeholder="Address"
                            value={newForm.address}
                            onChange={(e) =>
                              setNewForm((f) => ({
                                ...f,
                                address: e.target.value,
                              }))
                            }
                          />
                          <input
                            className="border rounded px-2 py-1 text-sm md:col-span-2"
                            placeholder="Phone Number"
                            value={newForm.phone_number}
                            onChange={(e) =>
                              setNewForm((f) => ({
                                ...f,
                                phone_number: e.target.value,
                              }))
                            }
                          />
                          <div className="flex gap-2 mt-1 md:col-span-2">
                            <button
                              type="button"
                              onClick={saveNew}
                              className="px-3 py-1 rounded-full bg-[#273e8e] text-white text-xs disabled:opacity-60"
                              disabled={savingNew}
                            >
                              {savingNew ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingNew(false);
                                setNewForm({
                                  title: "",
                                  contact_name: "",
                                  address: "",
                                  state: "",
                                  phone_number: "",
                                });
                              }}
                              className="px-3 py-1 rounded-full border text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected Address */}
                  <div className="flex items-start gap-3">
                    <div className="p-1 rounded-full border">
                      <div className="h-3 w-3 rounded-full bg-[#273e8e]"></div>
                    </div>
                    <div className="w-full bg-[#ededed] rounded-xl p-4 space-y-3">
                      <div>
                        <p className="text-sm text-gray-500">Contact name</p>
                        <p className="text-sm">
                          {selectedAddress?.contact_name ||
                            selectedAddress?.title ||
                            "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Address</p>
                        <p className="text-sm">
                          {selectedAddress?.address || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Phone Number</p>
                        <p className="text-sm">
                          {selectedAddress?.phone_number || "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between text-gray-600 text-sm">
                    <span>Delivery estimate</span>
                    <span className="text-gray-900 font-medium">
                      {deliveryEstimateLabel}
                    </span>
                  </div>
                  <hr className="border-gray-300" />
                  <div className="flex justify-between text-[#00000080] text-sm">
                    <span>Items subtotal</span>
                    <span className="text-[#273E8E]">
                      ₦{itemsCatalogSubtotal.toLocaleString()}
                    </span>
                  </div>
                  {showOutrightDiscountRow && (
                    <>
                      <div className="flex justify-between text-[#00000080] text-sm">
                        <span>{outrightDiscountLabel}</span>
                        <span className="text-emerald-700">
                          −₦
                          {Math.round(outrightDiscountAmount).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-[#00000080] text-sm font-medium">
                        <span>Items after discount</span>
                        <span className="text-[#273E8E]">
                          ₦{itemsChargedSubtotal.toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-[#00000080] text-sm">
                    <span>Delivery fee</span>
                    <span className="text-[#273E8E]">
                      {deliveryToShow
                        ? `₦${deliveryToShow.toLocaleString()}`
                        : "Free"}
                    </span>
                  </div>
                </div>

                <div>
                  <h1 className="text-xl py-3 font-semibold text-gray-600">
                    Installation
                  </h1>

                  <div className="flex items-start gap-3">
                    <div>
                      <input
                        type="checkbox"
                        checked={includeInstallation}
                        onChange={(e) => {
                          setIncludeInstallation(e.target.checked);
                        }}
                        className="h-3 w-3 rounded accent-[#273e8e] cursor-pointer"
                      />
                    </div>
                    <div
                      className={`w-full border-[1px] rounded-xl p-4 space-y-3 ${
                        includeInstallation
                          ? "bg-white border-gray-300"
                          : "bg-gray-100 border-gray-400"
                      }`}
                    >
                      <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg py-2 px-2">
                        <p className="text-yellow-600">
                          {installationNotice ||
                            "Optional: include only if you need Troosolar installation. When included, insurance is added to your order."}
                        </p>
                      </div>
                      <div className="flex justify-between text-gray-600 text-sm">
                        <span>Estimated window</span>
                        <span className="text-gray-900 font-medium">
                          {formatDateLabel(serverInstallEstimatedDate)}
                        </span>
                      </div>
                      {includeInstallation && (
                        <div className="flex flex-col gap-1 pt-1">
                          <label className="text-xs text-gray-600">
                            Preferred installation date
                          </label>
                          <input
                            type="date"
                            min={minInstallationDateStr()}
                            value={installationRequestedDate}
                            onChange={(e) =>
                              setInstallationRequestedDate(e.target.value)
                            }
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full max-w-[220px]"
                          />
                        </div>
                      )}
                      <hr className="border-gray-300" />
                      <div className="flex justify-between text-[#00000080] text-sm">
                        <span>Installation</span>
                        <span
                          className={`text-[#273E8E] ${
                            !includeInstallation
                              ? "line-through opacity-50"
                              : ""
                          }`}
                        >
                          ₦{installationToShow.toLocaleString()}
                        </span>
                      </div>
                      {includeInstallation && insuranceToShow > 0 && (
                        <div className="flex justify-between text-[#00000080] text-sm">
                          <span>
                            Insurance (
                            {serverInsurancePct > 0
                              ? `${Number(serverInsurancePct).toLocaleString()}%`
                              : "of items + installation"}
                            )
                          </span>
                          <span className="text-[#273E8E]">
                            ₦{insuranceToShow.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Order totals — line order: items → installation → delivery → insurance → VAT → total */}
                <div className="border-[1px] border-gray-300 p-4 rounded-xl space-y-3 bg-white">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Items (Qty)</span>
                    <span className="font-medium text-gray-900">
                      {serverItemsCount != null ? serverItemsCount : itemCount}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Items subtotal</span>
                    <span className="text-[#273e8e] font-medium">
                      ₦{itemsCatalogSubtotal.toLocaleString()}
                    </span>
                  </div>
                  {showOutrightDiscountRow && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">
                          {outrightDiscountLabel}
                        </span>
                        <span className="text-emerald-700 font-medium">
                          −₦
                          {Math.round(outrightDiscountAmount).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-dashed border-gray-200 pt-2">
                        <span className="text-gray-700">Items after discount</span>
                        <span className="text-[#273e8e] font-medium">
                          ₦{itemsChargedSubtotal.toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Installation</span>
                    <span
                      className={
                        includeInstallation
                          ? "text-[#273e8e] font-medium"
                          : "text-gray-400"
                      }
                    >
                      {includeInstallation
                        ? `₦${installationToShow.toLocaleString()}`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Delivery</span>
                    <span className="text-[#273e8e] font-medium">
                      {deliveryToShow
                        ? `₦${deliveryToShow.toLocaleString()}`
                        : "Free"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700 text-right max-w-[70%] leading-snug">
                      Insurance
                      {includeInstallation ? (
                        <>
                          {" "}
                          (
                          {Number.isFinite(Number(serverInsurancePct))
                            ? `${Number(serverInsurancePct)}%`
                            : "—"}{" "}
                          of items + installation)
                        </>
                      ) : (
                        <span className="text-gray-500">
                          {" "}
                          (when installation is included)
                        </span>
                      )}
                    </span>
                    <span
                      className={
                        includeInstallation && insuranceToShow > 0
                          ? "text-[#273e8e] font-medium"
                          : "text-gray-500"
                      }
                    >
                      ₦
                      {(includeInstallation ? insuranceToShow : 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">
                      VAT
                      {serverVatPct > 0
                        ? ` (${Number(serverVatPct).toLocaleString()}%)`
                        : ""}
                    </span>
                    <span className="text-[#273e8e] font-medium">
                      ₦{Number(serverVatAmount || 0).toLocaleString()}
                    </span>
                  </div>
                  <hr className="border-gray-300" />
                  <div className="flex justify-between font-bold text-[#273e8e] text-base">
                    <span>Total</span>
                    <span>₦{grandTotal.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Total includes VAT where applicable.
                  </p>
                </div>

                {/* Flutterwave checkout only (no alternate payment-method UI) */}
                <div className="border border-gray-300 rounded-xl p-4 bg-white space-y-3">
                  <p className="text-sm font-semibold text-[#1F2348]">
                    Flutterwave
                  </p>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Pay with card, USSD, or bank in the Flutterwave window after
                    you click Checkout. Your order is created only when payment
                    succeeds.
                  </p>
                  <p className="text-xs text-gray-500">
                    Total (incl. VAT):{" "}
                    <span className="font-semibold text-[#273e8e]">
                      ₦{grandTotal.toLocaleString()}
                    </span>
                  </p>
                </div>

                {lines.length > 0 &&
                  Number(grandTotal) < bnplMinimumAmount && (
                    <p className="text-xs text-gray-500">
                      Buy Now, Pay Later is only available for orders from ₦
                      {bnplMinimumAmount.toLocaleString()} — add more items to
                      cart or proceed to checkout.
                    </p>
                  )}

                <div
                  className={`grid gap-3 ${
                    showBnplButton ? "grid-cols-2" : "grid-cols-1"
                  }`}
                >
                  {showBnplButton && (
                    <button
                      type="button"
                      onClick={handleBuyByLoan}
                      className="py-3 border border-gray-300 rounded-full text-sm hover:bg-gray-100 transition disabled:opacity-60"
                      disabled={summaryLoading || processingPayment}
                    >
                      Buy By Loan
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handlePlaceOrder}
                    className="py-3 bg-[#273e8e] text-white rounded-full text-sm hover:bg-[#1f2f6e] transition disabled:opacity-60"
                    disabled={
                      lines.length === 0 ||
                      summaryLoading ||
                      placingOrder ||
                      processingPayment
                    }
                  >
                    {placingOrder
                      ? "Placing..."
                      : processingPayment
                      ? "Processing Payment..."
                      : "Checkout"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>

        {/* Final Confirmation Modal (desktop) */}
        {checkoutPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
            <div className="w-[90%] max-w-[430px] bg-white rounded-2xl shadow-md p-4">
              <div className="max-h-[450px] overflow-y-auto border rounded-2xl p-4">
                <div className="flex flex-col items-center gap-5 text-center">
                  <div
                    className={`${
                      checkout ? "bg-red-600 " : "bg-green-600"
                    } rounded-full flex items-center justify-center h-[100px] w-[100px]`}
                  >
                    {checkout ? (
                      <RxCrossCircled size={40} color="white" />
                    ) : (
                      <GiCheckMark size={40} color="white" />
                    )}
                  </div>

                  <p className="text-[15px]">
                    {checkout ? (
                      <span>
                        Oops! Something went wrong with your order.
                        <br />
                        Please try again or contact support.
                      </span>
                    ) : (
                      <span>
                        <strong>Congratulations</strong> — your order has been
                        placed successfully. We&apos;ve sent a confirmation email
                        to your registered email address. Our team will contact you
                        with delivery updates.
                        {orderData?.payment_method === "bank_transfer" ? (
                          <>
                            <br />
                            <br />
                            <span className="text-gray-700">
                              Complete your payment by bank transfer using your
                              order number as the payment reference.
                            </span>
                          </>
                        ) : null}
                      </span>
                    )}
                  </p>

                  <div className="w-full text-start text-sm max-w-[350px] space-y-3">
                    {lines.length > 0 ? (
                      lines.map((line) => (
                        <CartItems
                          key={line.cartLineId}
                          itemId={line.cartLineId}
                          productId={line.refId}
                          name={line.name}
                          price={line.unitPrice}
                          image={line.image}
                          showControls={false}
                          quantity={line.qty}
                          linkPath={
                            line.type === "bundle" 
                              ? `/productBundle/details/${line.refId}`
                              : `/homePage/product/${line.refId}`
                          }
                        />
                      ))
                    ) : (
                      <div className="bg-white border rounded-xl p-4 text-gray-500">
                        No items
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-4">
                {checkout ? (
                  <Link
                    to="/homePage?from=cart#catalog-products"
                    onClick={() => setCheckOutPayment(false)}
                    className="py-4 text-sm text-center rounded-full bg-[#273e8e] text-white hover:bg-[#1f2f6e] transition"
                  >
                    Add more products
                  </Link>
                ) : (
                  <Link
                    to={
                      orderData?.id
                        ? `/more?section=myOrders&orderId=${orderData.id}`
                        : "/more?section=myOrders"
                    }
                    onClick={() => setCheckOutPayment(false)}
                    className="py-4 text-sm text-center rounded-full bg-[#273e8e] text-white hover:bg-[#1f2f6e] transition"
                  >
                    See Order Details
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =========================
          MOBILE (new flow)
         ========================= */}
      <div className="flex sm:hidden min-h-screen w-full bg-[#F5F7FF]">
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="h-14 bg-white shadow-sm sticky top-0 z-20 relative flex items-center">
            <button
              onClick={() => {
                if (mobileStep === "cart") navigate(-1);
                else if (mobileStep === "delivery") setMobileStep("cart");
                else if (mobileStep === "summary") setMobileStep("delivery");
                else if (mobileStep === "result") setMobileStep("summary");
              }}
              className="absolute left-4 text-[#273e8e]"
              aria-label="Back"
            >
              <ChevronLeft size={22} />
            </button>
            <h1 className="mx-auto text-[16px] font-medium">
              {mobileStep === "cart"
                ? "Cart"
                : mobileStep === "delivery"
                ? "Checkout"
                : mobileStep === "summary"
                ? "Summary"
                : "Order"}
            </h1>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4 pb-28">
            {/* STEP 1: Cart list */}
            {mobileStep === "cart" && (
              <>
                <Link to="/homePage?from=cart#catalog-products">
                  <div className="px-4 py-3 text-sm rounded-xl bg-white flex justify-between items-center border border-gray-400 hover:border-[#273e8e]">
                    <span>Add more products</span>
                    <LucideSquarePlus size={18} className="text-[#273e8e]" />
                  </div>
                </Link>

                {loading ? (
                  <div className="px-4 p-4 text-sm rounded-xl bg-white border text-gray-500">
                    Loading…
                  </div>
                ) : err ? (
                  <div className="px-4 p-4 text-sm rounded-xl bg-white border text-red-600">
                    {err}
                  </div>
                ) : lines.length === 0 ? (
                  <div className="px-4 p-4 text-sm rounded-xl bg-white border text-gray-500">
                    Your cart is empty.
                  </div>
                ) : (
                  lines.map((line) => (
                    <CartItems
                      key={line.cartLineId}
                      itemId={line.cartLineId}
                      productId={line.refId}
                      name={line.name}
                      price={line.unitPrice}
                      image={line.image}
                      showControls={true}
                      quantity={line.qty}
                      onIncrement={increment}
                      onDecrement={decrement}
                      onDelete={removeLine}
                      linkPath={
                        line.type === "bundle" 
                          ? `/productBundle/details/${line.refId}`
                          : `/homePage/product/${line.refId}`
                      }
                    />
                  ))
                )}

                {/* Total + Checkout */}
                <div className="mt-[160px]">
                  <p className="text-sm text-gray-600">Total</p>
                  <div className="mt-1 flex items-center">
                    <p className="text-[14px]  font-[500] text-[#273e8e]">
                      ₦{amountTotal.toLocaleString()}
                    </p>
                    <button
                      className="px-25 py-4 rounded-full text-[12px] bg-[#273e8e] text-white disabled:opacity-60 ml-[25px]"
                      disabled={lines.length === 0}
                      onClick={() => {
                        setMobileStep("delivery");
                      }}
                    >
                      Checkout
                    </button>
                  </div>

                  {showBnplButton && (
                    <div className="mt-4 rounded-xl border border-[#E8A91D] bg-[#F7F9CC] p-4 text-[12px] text-yellow-700">
                      <div>{BNPL_PROMO_COPY}</div>
                      <button
                        type="button"
                        onClick={handleBuyByLoan}
                        className="mt-3 inline-flex text-white rounded-full border border-yellow-400 bg-[#E8A91D] px-4 py-2 text-[12px]"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* STEP 2: Delivery */}
            {mobileStep === "delivery" && (
              <>
                <SectionHeading>Delivery Details</SectionHeading>

                {/* Delivery details card */}
                <div className="bg-white border border-gray-400 rounded-2xl p-4 space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-medium text-gray-900">
                      Delivery Address
                    </h3>
                    <button
                      type="button"
                      onClick={() => setOpenPicker((s) => !s)}
                      className="text-sm text-[#273e8e] hover:underline focus:underline"
                    >
                      {summaryLoading ? "Loading…" : "Change"}
                    </button>
                  </div>

                  {/* Address picker */}
                  {openPicker && (
                    <div className="rounded-xl border border-gray-200 p-3 space-y-3 bg-gray-50">
                      {addresses.length ? (
                        addresses.map((a) => (
                          <label
                            key={a.id}
                            className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:border-gray-300"
                          >
                            <input
                              type="radio"
                              className="mt-1"
                              name="deliveryAddressM"
                              checked={
                                String(selectedAddressId) === String(a.id)
                              }
                              onChange={() => selectExisting(a.id)}
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900">
                                {a.contact_name || a.title}
                              </div>
                              <div className="text-xs text-gray-500">{a.title}</div>
                              <div className="text-xs text-gray-600">
                                {a.address}
                              </div>
                              <div className="text-xs text-gray-600">
                                {a.state} — {a.phone_number}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => startEdit(a)}
                              className="text-xs text-[#273e8e] hover:underline"
                            >
                              Edit
                            </button>
                          </label>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">
                          No addresses yet.
                        </div>
                      )}

                      {!addingNew ? (
                        <button
                          type="button"
                          onClick={() => setAddingNew(true)}
                          className="text-xs text-[#273e8e] hover:underline"
                        >
                          + Add new address
                        </button>
                      ) : (
                        <div className="grid grid-cols-1 gap-2">
                          <input
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#273e8e]/20 focus:border-[#273e8e]"
                            placeholder="Title"
                            value={newForm.title}
                            onChange={(e) =>
                              setNewForm((f) => ({
                                ...f,
                                title: e.target.value,
                              }))
                            }
                          />
                          <input
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#273e8e]/20 focus:border-[#273e8e]"
                            placeholder="Contact name"
                            value={newForm.contact_name}
                            onChange={(e) =>
                              setNewForm((f) => ({
                                ...f,
                                contact_name: e.target.value,
                              }))
                            }
                          />
                          <input
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#273e8e]/20 focus:border-[#273e8e]"
                            placeholder="State"
                            value={newForm.state}
                            onChange={(e) =>
                              setNewForm((f) => ({
                                ...f,
                                state: e.target.value,
                              }))
                            }
                          />
                          <input
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#273e8e]/20 focus:border-[#273e8e]"
                            placeholder="Address"
                            value={newForm.address}
                            onChange={(e) =>
                              setNewForm((f) => ({
                                ...f,
                                address: e.target.value,
                              }))
                            }
                          />
                          <input
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#273e8e]/20 focus:border-[#273e8e]"
                            placeholder="Phone Number"
                            value={newForm.phone_number}
                            onChange={(e) =>
                              setNewForm((f) => ({
                                ...f,
                                phone_number: e.target.value,
                              }))
                            }
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={saveNew}
                              className="px-4 py-2 rounded-full bg-[#273e8e] text-white text-xs disabled:opacity-60"
                              disabled={savingNew}
                            >
                              {savingNew ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingNew(false);
                                setNewForm({
                                  title: "",
                                  contact_name: "",
                                  address: "",
                                  state: "",
                                  phone_number: "",
                                });
                              }}
                              className="px-4 py-2 rounded-full border border-gray-300 text-xs text-gray-700 bg-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected address preview box */}
                  <div className="w-full rounded-2xl bg-[#F7F8FA] p-4 ring-1 ring-gray-100">
                    <div className="space-y-1">
                      <p className="text-[11px] text-gray-500">Contact name</p>
                      <p className="text-sm text-gray-900">
                        {selectedAddress?.contact_name ||
                          selectedAddress?.title ||
                          "—"}
                      </p>
                    </div>
                    <div className="space-y-1 mt-3">
                      <p className="text-[11px] text-gray-500">Address</p>
                      <p className="text-sm text-gray-900">
                        {selectedAddress?.address || "—"}
                      </p>
                    </div>
                    <div className="mt-4 space-y-1">
                      <p className="text-[11px] text-gray-500">Phone Number</p>
                      <p className="text-sm text-gray-900">
                        {selectedAddress?.phone_number || "—"}
                      </p>
                    </div>
                  </div>

                  {/* Rows */}
                  <div className="flex justify-between items-center py-3 border-t border-gray-200 text-xs">
                    <span className="text-gray-600">Delivery estimate</span>
                    <span className="text-gray-900 font-medium">
                      {deliveryEstimateLabel}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-3 border-t border-gray-200 text-xs">
                    <span className="text-gray-500">Items subtotal</span>
                    <span className="text-[#273e8e] font-semibold">
                      ₦{itemsCatalogSubtotal.toLocaleString()}
                    </span>
                  </div>
                  {showOutrightDiscountRow && (
                    <>
                      <div className="flex justify-between items-center py-3 border-t border-gray-200 text-xs">
                        <span className="text-gray-500">
                          {outrightDiscountLabel}
                        </span>
                        <span className="text-emerald-700 font-semibold">
                          −₦
                          {Math.round(outrightDiscountAmount).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-3 border-t border-gray-200 text-xs font-semibold">
                        <span className="text-gray-600">Items after discount</span>
                        <span className="text-[#273e8e]">
                          ₦{itemsChargedSubtotal.toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between items-center py-3 border-t border-gray-200 text-xs">
                    <span className="text-gray-500">Delivery fee</span>
                    <span className="text-[#273e8e] font-semibold">
                      {deliveryToShow
                        ? `₦${deliveryToShow.toLocaleString()}`
                        : "Free"}
                    </span>
                  </div>
                </div>

                {/* Installation */}
                <SectionHeading>Installation</SectionHeading>

                <div className="bg-white border border-gray-400 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-3 mb-3">
                    <input
                      type="checkbox"
                      checked={includeInstallation}
                      onChange={(e) => {
                        setIncludeInstallation(e.target.checked);
                      }}
                      className="h-4 w-4 rounded accent-[#273e8e] cursor-pointer"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Include installation &amp; insurance
                    </span>
                  </div>
                  <div className="rounded-lg border-2 border-yellow-400 bg-yellow-50 p-3 text-[12px] text-yellow-700">
                    {installationNotice ||
                      "Optional: tick only if you want Troosolar installation. Insurance applies when installation is included."}
                  </div>
                  <div className="flex justify-between text-gray-600 text-sm">
                    <span>Estimated window</span>
                    <span className="text-gray-900 font-medium">
                      {formatDateLabel(serverInstallEstimatedDate)}
                    </span>
                  </div>
                  {includeInstallation && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-600">
                        Preferred installation date
                      </label>
                      <input
                        type="date"
                        min={minInstallationDateStr()}
                        value={installationRequestedDate}
                        onChange={(e) =>
                          setInstallationRequestedDate(e.target.value)
                        }
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full"
                      />
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-[#00000080]">Installation</span>
                    <span
                      className={`text-[#273e8e] ${
                        !includeInstallation ? "line-through opacity-50" : ""
                      }`}
                    >
                      ₦{installationToShow.toLocaleString()}
                    </span>
                  </div>
                  {includeInstallation && insuranceToShow > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#00000080]">
                        Insurance (
                        {serverInsurancePct > 0
                          ? `${Number(serverInsurancePct).toLocaleString()}%`
                          : ""}
                        )
                      </span>
                      <span className="text-[#273e8e]">
                        ₦{insuranceToShow.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Flutterwave only — same as desktop (no payment-method tabs) */}
                <div className="border border-gray-300 rounded-2xl p-4 bg-white space-y-3">
                  <p className="text-sm font-semibold text-[#1F2348]">
                    Flutterwave
                  </p>
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    Pay with card, USSD, or bank in the Flutterwave window on the
                    next step. Your order is created only when payment
                    succeeds.
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Total (incl. VAT):{" "}
                    <span className="font-semibold text-[#273e8e]">
                      ₦{grandTotal.toLocaleString()}
                    </span>
                  </p>
                </div>

                {/* Total + Button */}
                <div className="rounded-2xl p-4 space-y-2 flex justify-around ">
                  <div>
                    <p className="text-sm text-gray-700">Total (incl. VAT)</p>
                    <p className="mt-1 font-[500] text-[18px] text-[#273e8e]">
                      ₦{grandTotal.toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={handleCreateOrderMobile}
                    className="w-full mt-2 py-4 rounded-full text-[12px] bg-[#273e8e] text-white disabled:opacity-60 ml-[20px]"
                    disabled={
                      lines.length === 0 || summaryLoading || placingOrder
                    }
                  >
                    {placingOrder ? "Preparing…" : "Continue"}
                  </button>
                </div>
              </>
            )}

            {/* STEP 3: Summary / Pay */}
            {mobileStep === "summary" && (
              <>
                <SectionHeading>Product Details</SectionHeading>
                {firstLine && (
                  <div className="bg-white border border-gray-400 rounded-2xl p-4 flex items-center gap-3">
                    <img
                      src={firstLine.image || FALLBACK_IMAGE}
                      alt=""
                      className="h-14 w-14 object-contain rounded bg-gray-100"
                      onError={(e) => {
                        if (e.target.src !== FALLBACK_IMAGE) e.target.src = FALLBACK_IMAGE;
                      }}
                    />
                    <div className="flex-1">
                      <Link
                        to={
                          firstLine.type === "bundle" 
                            ? `/productBundle/details/${firstLine.refId}`
                            : `/homePage/product/${firstLine.refId}`
                        }
                        className="text-sm line-clamp-2 hover:text-[#273e8e] hover:underline transition-colors"
                      >
                        {firstLine.name}
                      </Link>
                      <p className="text-[#273e8e] font-semibold">
                        ₦{firstLine.unitPrice.toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}

                <SectionHeading>Delivery Details</SectionHeading>
                <div className="bg-white border border-gray-400 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium">Delivery Details</h3>
                    <button
                      type="button"
                      className="text-sm text-[#273e8e] underline"
                      onClick={() => setMobileStep("delivery")}
                    >
                      Change
                    </button>
                  </div>
                  <div className="rounded-lg bg-[#ededed] p-3 text-sm">
                    <div className="text-gray-500 text-xs">Contact name</div>
                    <div>
                      {selectedAddress?.contact_name ||
                        selectedAddress?.title ||
                        "—"}
                    </div>
                    <div className="mt-2 text-gray-500 text-xs">Address</div>
                    <div>{selectedAddress?.address || "—"}</div>
                    <div className="mt-2 text-gray-500 text-xs">
                      Phone Number
                    </div>
                    <div>{selectedAddress?.phone_number || "—"}</div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Delivery estimate</span>
                    <span className="text-gray-900 font-medium">
                      {deliveryEstimateLabel}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[#00000080]">Items subtotal</span>
                    <span className="text-[#273e8e]">
                      ₦{itemsCatalogSubtotal.toLocaleString()}
                    </span>
                  </div>
                  {showOutrightDiscountRow && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#00000080]">
                          {outrightDiscountLabel}
                        </span>
                        <span className="text-emerald-700">
                          −₦
                          {Math.round(outrightDiscountAmount).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-medium">
                        <span className="text-gray-700">Items after discount</span>
                        <span className="text-[#273e8e]">
                          ₦{itemsChargedSubtotal.toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-[#00000080]">Delivery fee</span>
                    <span className="text-[#273e8e]">
                      {deliveryToShow
                        ? `₦${deliveryToShow.toLocaleString()}`
                        : "Free"}
                    </span>
                  </div>
                </div>

                <SectionHeading>Installation</SectionHeading>
                <div className="bg-white border rounded-2xl border-gray-400 p-4 space-y-3">
                  <div className="flex items-center gap-3 mb-3">
                    <input
                      type="checkbox"
                      checked={includeInstallation}
                      onChange={(e) => {
                        setIncludeInstallation(e.target.checked);
                      }}
                      className="h-4 w-4 rounded accent-[#273e8e] cursor-pointer"
                    />
                    <span className="text-xs font-medium text-gray-700">
                      Include installation &amp; insurance
                    </span>
                  </div>
                  <div className="rounded-lg border-2 border-yellow-400 bg-yellow-50 p-3 text-[12px] text-yellow-700">
                    {installationNotice ||
                      "Optional: include only if you need Troosolar installation. Insurance applies when installation is included."}
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Estimated window</span>
                    <span className="text-gray-900 font-sm">
                      {formatDateLabel(serverInstallEstimatedDate)}
                    </span>
                  </div>
                  {includeInstallation && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-600">
                        Preferred installation date
                      </label>
                      <input
                        type="date"
                        min={minInstallationDateStr()}
                        value={installationRequestedDate}
                        onChange={(e) =>
                          setInstallationRequestedDate(e.target.value)
                        }
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full"
                      />
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-[#00000080]">Installation</span>
                    <span
                      className={`text-[#273e8e] ${
                        !includeInstallation ? "line-through opacity-50" : ""
                      }`}
                    >
                      ₦{installationToShow.toLocaleString()}
                    </span>
                  </div>
                  {includeInstallation && insuranceToShow > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-[#00000080]">
                        Insurance (
                        {serverInsurancePct > 0
                          ? `${Number(serverInsurancePct).toLocaleString()}%`
                          : ""}
                        )
                      </span>
                      <span className="text-[#273e8e]">
                        ₦{insuranceToShow.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                <SectionHeading>Payment</SectionHeading>
                <div className="bg-white border border-gray-400 rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-[#1F2348]">
                    Flutterwave
                  </p>
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    Card, USSD, or bank — complete payment in the Flutterwave
                    window when you tap Proceed to Pay.
                  </p>
                </div>

                {/* Total + Proceed */}
                <div className="rounded-2xl  flex mt-9">
                  <div>
                    <p className="text-sm text-gray-700">Total</p>
                    <p className="mt-1 font-[500] text-[18px] text-[#273e8e]">
                      ₦{(orderData?.total_price || grandTotal).toLocaleString()}
                    </p>
                  </div>

                  <button
                    className="w-full mt-3 py-4 rounded-full bg-[#273e8e] text-white text-[12px] disabled:opacity-60 ml-[10px]"
                    onClick={async () => {
                      if (!installationDateOk()) return;
                      if (!token) {
                        alert("Please log in first.");
                        return;
                      }
                      const payAmount = Number(grandTotal) || 0;
                      if (payAmount <= 0) {
                        alert("Invalid order total. Go back and refresh checkout.");
                        return;
                      }
                      await startFlutterwavePayment(payAmount, {
                        onSuccessfulCharge: async (fwResponse) => {
                          const txId = String(
                            fwResponse.transaction_id ?? fwResponse.id ?? ""
                          ).trim();
                          if (!txId) {
                            throw new Error("Missing payment reference from gateway.");
                          }
                          const { data } = await axios.post(
                            ORDERS_URL,
                            {
                              ...buildCartOrderBody(),
                              flutterwave_transaction_id: txId,
                            },
                            {
                              headers: {
                                Accept: "application/json",
                                Authorization: `Bearer ${token}`,
                              },
                            }
                          );
                          if (data?.status !== "success" || !data?.data) {
                            throw new Error(
                              data?.message ||
                                "Could not create your order after payment. Contact support with your transaction reference."
                            );
                          }
                          setOrderData(data.data);
                        },
                      });
                    }}
                    disabled={processingPayment || lines.length === 0}
                  >
                    {processingPayment ? "Processing…" : "Proceed to Pay"}
                  </button>
                </div>
              </>
            )}

            {/* STEP 4: Result (mobile full-screen page) */}
            {mobileStep === "result" && (
              <div className="flex flex-col gap-4">
                <div className="bg-white rounded-2xl border p-4">
                  <div className="flex flex-col items-center text-center gap-4 py-4">
                    <div
                      className={`${
                        paymentResult === "success"
                          ? "bg-green-500"
                          : "bg-red-500"
                      } h-24 w-24 rounded-full flex items-center justify-center`}
                    >
                      {paymentResult === "success" ? (
                        <GiCheckMark size={40} color="white" />
                      ) : (
                        <RxCrossCircled size={40} color="white" />
                      )}
                    </div>

                    {paymentResult === "success" ? (
                      <p className="text-sm text-[#1F2348] leading-6">
                        <strong>Congratulations</strong> — your order has been
                        placed successfully. We&apos;ve sent a confirmation email
                        to your registered email address. Our team will contact you
                        with delivery updates.
                        {orderData?.payment_method === "bank_transfer" ? (
                          <>
                            <br />
                            <br />
                            Use your order number as the reference when you complete
                            your bank transfer.
                          </>
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-sm text-[#1F2348] leading-6">
                        Your order could not be placed due to a failed payment
                      </p>
                    )}

                    {/* Product rows - Show all ordered items */}
                    <div className="w-full space-y-3">
                      {lines.length > 0 ? (
                        lines.map((line) => (
                          <div
                            key={line.cartLineId}
                            className="border rounded-xl p-3 flex items-center gap-3"
                          >
                            <Link
                              to={
                                line.type === "bundle" 
                                  ? `/productBundle/details/${line.refId}`
                                  : `/homePage/product/${line.refId}`
                              }
                              className="flex items-center gap-3 w-full"
                            >
                              <img
                                src={line.image || FALLBACK_IMAGE}
                                alt={line.name}
                                className="h-14 w-14 object-contain rounded bg-gray-100"
                                onError={(e) => {
                                  if (e.target.src !== FALLBACK_IMAGE) e.target.src = FALLBACK_IMAGE;
                                }}
                              />
                              <div className="flex-1">
                                <p className="text-sm line-clamp-2 hover:text-[#273e8e] hover:underline transition-colors">
                                  {line.name}
                                </p>
                                <p className="text-[#273e8e] font-semibold">
                                  ₦{line.unitPrice.toLocaleString()} x{" "}
                                  {line.qty}
                                </p>
                              </div>
                            </Link>
                          </div>
                        ))
                      ) : (
                        <div className="border rounded-xl p-3 text-gray-500 text-center">
                          No items found
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                <button
                  type="button"
                  className="w-full rounded-full bg-[#273e8e] text-white py-4"
                  onClick={() => {
                    if (paymentResult === "success") {
                      navigate(
                        orderData?.id
                          ? `/more?section=myOrders&orderId=${orderData.id}`
                          : "/more?section=myOrders"
                      );
                    } else {
                      navigate("/homePage");
                    }
                  }}
                >
                  {paymentResult === "success"
                    ? "See Order Details"
                    : "Continue Shopping"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Cart;
