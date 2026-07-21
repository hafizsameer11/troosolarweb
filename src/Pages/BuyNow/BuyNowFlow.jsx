import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Home, Building2, Factory, ArrowRight, ArrowLeft, Zap, Wrench, FileText, CheckCircle, Battery, Sun, Monitor, Shield, Calendar, Loader, CheckCircle2, XCircle, AlertCircle, CreditCard, Minus, Plus, X, Info, ChevronDown, ChevronLeft, ChevronRight, User, MapPin, Phone } from 'lucide-react';
import axios from 'axios';
import API, { BASE_URL, FLUTTERWAVE_PUBLIC_KEY } from '../../config/api.config';
import ProductPromoBadges from '../../Component/ProductPromoBadges';
import AuditPreferredScheduleFields from '../../Component/AuditPreferredScheduleFields';
import GridPagination from '../../Component/GridPagination';
import ProductCategoryGrid from '../../Component/ProductCategoryGrid';
import {
    classifyInvoiceFeeKind,
    filterBillableInvoiceFees,
} from '../../utils/invoiceFees';
import PaymentSummaryCard from '../../Component/OrderComponents/PaymentSummaryCard';
import { resolveProductOnlyCheckoutFees, inferProductFeeCategory } from '../../utils/buyNowProductFees';
import {
  formatInsurancePercentLabel,
  resolveCheckoutInsurancePercent,
} from '../../utils/checkoutInsurance';
import {
  generateLocalCalendarSlots,
  uniqueCalendarDates,
} from '../../utils/installationSlots';
import { filterBundleCustomServicesByFlow, BUNDLE_CHECKOUT_FLOWS } from '../../utils/bundleOrderListFlow';
import { loginPathWithReturn } from '../../utils/authRedirect';
import { persistSessionFromCartAccess } from '../../utils/cartAccessAuth';
import {
    extractKvaFromBundle,
    sortBundlesByKvaAsc,
    sortBundlesFeaturedThenKvaAsc,
    sortCategoryProducts,
    sortProductsByPromoFirst,
    dedupeProductsById,
    entityTopDeal,
    entityHighlyRecommended,
} from '../../utils/bundleSort';

const BUNDLE_STEP_GRID_PAGE_SIZE = 9;

// Helper function to convert storage paths to absolute URLs (same as SolarBundle.jsx)
const toAbsolute = (path) => {
    if (!path) return '';
    // Extract base URL from API config (remove /api)
    const API_BASE = BASE_URL || 'http://127.0.0.1:8000/api';
    const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '') || 'http://127.0.0.1:8000';
    
    // Already absolute URL
    if (/^https?:\/\//i.test(path)) return path;
    
    // Path starts with / (e.g., "/storage/products/xyz.jpg")
    if (path.startsWith('/')) return `${API_ORIGIN}${path}`;
    
    // Path without leading slash (e.g., "bundles/xyz.jpg" or "public/bundles/xyz.jpg")
    // Remove "public/" prefix if present, then prepend /storage/
    const cleaned = path.replace(/^public\//, '');
    return `${API_ORIGIN}/storage/${cleaned}`;
};

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

// Fallback image URL
const FALLBACK_IMAGE = "https://api.troosolar.com/storage/products/d5c7f116-57ed-46ef-a659-337c94c308a9.png";
const FEE_VIS_TROO_PREFIX = "[FEE:TROOSOLAR]";
const FEE_VIS_OWN_PREFIX = "[FEE:OWN]";
const FEE_VIS_BOTH_PREFIX = "[FEE]";
const OL_VIS_TROO_PREFIX = "[OL:TROOSOLAR]";
const OL_VIS_OWN_PREFIX = "[OL:OWN]";
const stripFeeVisibilityPrefix = (title) => {
    const t = String(title || '');
    if (t.startsWith(FEE_VIS_TROO_PREFIX)) return t.slice(FEE_VIS_TROO_PREFIX.length).trim();
    if (t.startsWith(FEE_VIS_OWN_PREFIX)) return t.slice(FEE_VIS_OWN_PREFIX.length).trim();
    if (t.startsWith(FEE_VIS_BOTH_PREFIX)) return t.slice(FEE_VIS_BOTH_PREFIX.length).trim();
    return t;
};

/** True when the selection is a catalog product (not a material stub from custom bundle calc). */
const isRealCatalogProductSelection = (p) => {
    const prod = p?.product;
    if (!prod || !p?.id) return false;
    if (prod.title) return true;
    if (prod.featured_image || prod.featured_image_url) return true;
    if (prod.category_id != null) return true;
    return false;
};

const GENERIC_INVOICE_BUCKET_LABELS = new Set([
    'solar inverter',
    'solar panels',
    'battery',
    'batteries',
]);

const isGenericInvoiceBreakdownRows = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return false;
    return rows.every((row) => {
        const desc = String(row.description || '').trim().toLowerCase();
        return GENERIC_INVOICE_BUCKET_LABELS.has(desc)
            || [...GENERIC_INVOICE_BUCKET_LABELS].some((label) => desc.startsWith(`${label} `));
    });
};

const buildStandaloneProductInvoiceRows = ({
    selectedProducts = [],
    selectedMaterials = [],
    allMaterialsMap = {},
    categoryMaterials = [],
    invoiceDetails = null,
    orderFetchedLineItems = [],
    hasSelectedBundles = false,
}) => {
    const standaloneProducts = (selectedProducts || []).filter(isRealCatalogProductSelection);
    if (hasSelectedBundles && standaloneProducts.length === 0) {
        return [];
    }

    return buildPostCheckoutProductRows({
        selectedProducts: hasSelectedBundles ? standaloneProducts : selectedProducts,
        selectedMaterials,
        allMaterialsMap,
        categoryMaterials,
        invoiceDetails,
        orderFetchedLineItems,
        skipGenericApiBreakdown: hasSelectedBundles,
    });
};

const buildPreCheckoutStandaloneProductRows = ({
    selectedProducts = [],
    selectedMaterials = [],
    allMaterialsMap = {},
    categoryMaterials = {},
    hasSelectedBundles = false,
}) => {
    const standaloneProducts = (selectedProducts || []).filter(isRealCatalogProductSelection);
    if (hasSelectedBundles) {
        if (standaloneProducts.length > 0) {
            return mapSelectedProductsToInvoiceRows(standaloneProducts);
        }
        return [];
    }

    return buildPreCheckoutProductRows({
        selectedProducts,
        selectedMaterials,
        allMaterialsMap,
        categoryMaterials,
    });
};

const mapApiLineItemsToInvoiceRows = (items, idPrefix = 'api') => {
    if (!Array.isArray(items)) return [];
    return items.map((row, idx) => {
        const qty = Math.max(1, Number(row.quantity ?? 1));
        const totalCost = Number(row.total_cost ?? row.subtotal ?? 0);
        const rate = Number(row.rate ?? row.unit_price ?? 0) || (qty > 0 ? totalCost / qty : 0);
        const productId = row.product_id ?? row.itemable_id ?? row.id ?? null;
        return {
            id: `${idPrefix}-${productId ?? idx}`,
            productId,
            description: row.description || row.title || row.item?.title || row.item?.name || `Item #${productId ?? idx}`,
            quantity: qty,
            unit: row.unit || 'Nos',
            rate,
            totalCost: totalCost > 0 ? totalCost : rate * qty,
        };
    });
};

const mapSelectedProductsToInvoiceRows = (selectedProducts) => {
    if (!Array.isArray(selectedProducts)) return [];
    return selectedProducts.map((p) => {
        const qty = p.quantity || 1;
        const unitPrice = p.price || 0;
        const prod = p.product || {};
        return {
            id: `sel-p-${p.id}`,
            productId: p.id,
            description: prod.title || prod.name || `Product #${p.id}`,
            quantity: qty,
            unit: 'Nos',
            rate: unitPrice,
            totalCost: unitPrice * qty,
        };
    });
};

const mapMaterialsToInvoiceRows = (selectedMaterials, allMaterialsMap, categoryMaterials) => {
    if (!Array.isArray(selectedMaterials) || selectedMaterials.length === 0) return [];
    return selectedMaterials.map((selMat) => {
        const material = allMaterialsMap?.[selMat.material_id]
            || categoryMaterials?.find((m) => m.id === selMat.material_id);
        const qty = selMat.quantity || 1;
        const rawPrice = Number(material?.selling_rate ?? material?.rate ?? 0);
        const unitPrice = rawPrice > 0 ? rawPrice : 0;
        return {
            id: `mat-${selMat.material_id}`,
            description: material?.name || material?.title || `Material #${selMat.material_id}`,
            quantity: qty,
            unit: 'Nos',
            rate: unitPrice,
            totalCost: unitPrice * qty,
        };
    }).filter((r) => r.description);
};

const mapOrderItemsToInvoiceRows = (items) => {
    if (!Array.isArray(items)) return [];
    return items.map((item, idx) => {
        const qty = Math.max(1, Number(item.quantity ?? 1));
        const listUnit = Number(item.list_unit_price ?? 0);
        const chargedUnit = Number(item.unit_price ?? 0);
        const subtotal = Number(item.subtotal ?? 0);
        // Prefer catalog/list price for display; fall back to charged unit price
        const rate = listUnit > 0 ? listUnit : (chargedUnit > 0 ? chargedUnit : (qty > 0 && subtotal > 0 ? subtotal / qty : 0));
        const totalCost = listUnit > 0 ? listUnit * qty : (subtotal > 0 ? subtotal : rate * qty);
        const title = item.item?.title || item.item?.name || item.title || `Item #${idx + 1}`;
        return {
            id: `ord-item-${item.itemable_id ?? idx}`,
            productId: item.itemable_id ?? null,
            description: title,
            quantity: qty,
            unit: 'Nos',
            rate,
            totalCost,
        };
    }).filter((r) => r.description && (r.totalCost > 0 || r.rate > 0));
};

/** Pre-checkout (order summary / pre-payment invoice): cart selections only. */
const buildPreCheckoutProductRows = ({
    selectedProducts = [],
    selectedMaterials = [],
    allMaterialsMap = {},
    categoryMaterials = [],
}) => {
    const productRows = mapSelectedProductsToInvoiceRows(selectedProducts);
    if (productRows.length > 0) return productRows;
    return mapMaterialsToInvoiceRows(selectedMaterials, allMaterialsMap, categoryMaterials);
};

/**
 * Post-checkout payment invoice: one authoritative source (no merging catalog + charged duplicates).
 * Priority: checkout API line items → cart selections → persisted order items.
 */
const buildPostCheckoutProductRows = ({
    selectedProducts = [],
    selectedMaterials = [],
    allMaterialsMap = {},
    categoryMaterials = [],
    invoiceDetails = null,
    orderFetchedLineItems = [],
    skipGenericApiBreakdown = false,
}) => {
    const apiRows = mapApiLineItemsToInvoiceRows(invoiceDetails?.product_line_items, 'api');
    if (apiRows.length > 0) {
        if (!(skipGenericApiBreakdown && isGenericInvoiceBreakdownRows(apiRows))) {
            return apiRows;
        }
    }

    const selectedRows = buildPreCheckoutProductRows({
        selectedProducts,
        selectedMaterials,
        allMaterialsMap,
        categoryMaterials,
    });
    if (selectedRows.length > 0) return selectedRows;

    return mapOrderItemsToInvoiceRows(orderFetchedLineItems);
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const feeAmountFromServiceRows = (rows, needle) => {
    const billable = filterBillableInvoiceFees(
        (rows || []).map((r) => ({
            description: r.description,
            rate: Number(r.rate || 0),
        }))
    );
    const match = billable.find((r) => classifyInvoiceFeeKind(r.description) === needle);
    return match ? Number(match.rate || 0) : 0;
};

/** Sum delivery / installation / inspection / material from bundle custom_services fee rows. */
const aggregateBundleServiceFees = (selectedBundles, getServiceRows) => {
    const merged = [];
    (selectedBundles || []).forEach((sb) => {
        (getServiceRows(sb?.bundle || {}) || []).forEach((r) => {
            const amount = Number(r.rate || 0) * (r.quantityApplies === false ? 1 : Number(r.quantity || 1));
            if (amount > 0) {
                merged.push({ description: r.description, rate: amount });
            }
        });
    });
    return {
        deliveryFee: feeAmountFromServiceRows(merged, 'delivery'),
        installationFee: feeAmountFromServiceRows(merged, 'installation'),
        inspectionFee: feeAmountFromServiceRows(merged, 'inspection'),
        materialCost: feeAmountFromServiceRows(merged, 'material'),
    };
};

const mapBundleLineItemsToRows = (items, bundleQty, bundleId) =>
    (items || []).map((item, idx) => ({
        id: `b-${bundleId}-${idx}`,
        description: item.description,
        quantity: item.quantityApplies === false
            ? 'NIL'
            : (item.unit === 'Lots' ? 1 : item.quantity * bundleQty),
        unit: item.unit,
        rate: item.rate,
        totalCost: item.rate * (item.quantityApplies === false
            ? 1
            : (item.unit === 'Lots' ? 1 : item.quantity * bundleQty)),
    }));

const invoiceRowsIncludeFee = (rows, needle) =>
    (rows || []).some((r) => classifyInvoiceFeeKind(r.description) === needle);

/** Keep one row per fee kind when admin has duplicate invoice fee entries. */
const dedupeFeeRowsByKind = (rows) => {
    const kept = new Set();
    return (rows || []).filter((r) => {
        const kind = classifyInvoiceFeeKind(r.description);
        if (!kind) return true;
        if (kept.has(kind)) return false;
        kept.add(kind);
        return true;
    });
};

const buyNowMaterialFeeApplies = (installerChoice, includeInstallationMaterial) =>
    installerChoice === 'own' && !!includeInstallationMaterial;

const appendResolvedFeeRows = (rows, fees, bundleId) => {
    const next = [...(rows || [])];
    const pushFee = (needle, label, amount, unit = 'Lots') => {
        const value = Number(amount || 0);
        if (value <= 0 || invoiceRowsIncludeFee(next, needle)) return;
        next.push({
            id: `fee-${bundleId}-${needle}`,
            description: label,
            quantity: 1,
            unit,
            rate: value,
            totalCost: value,
        });
    };
    pushFee('delivery', 'Delivery Fees', fees.deliveryFee);
    pushFee('installation', 'Installation Fees', fees.installationFee);
    pushFee('inspection', 'Inspection Fees', fees.inspectionFee);
    pushFee('material', 'Installation Material', fees.materialCost);
    return next;
};

const pickCheckoutFee = (apiAmount, bundleAmount, fallbackAmount) => {
    const api = Number(apiAmount || 0);
    if (api > 0) return api;
    const bundle = Number(bundleAmount || 0);
    if (bundle > 0) return bundle;
    return Number(fallbackAmount || 0);
};

/** Prefer explicit bundle invoice-tab fee; never use global/API fallback for bundles. */
const pickBundleScopedFee = (apiAmount, bundleAmount, fallbackAmount, bundleFeesOnly) => {
    if (bundleFeesOnly) {
        // Bundles: Invoice fees tab only. Missing fee => 0 (do not reuse checkout/API defaults).
        return Number(bundleAmount || 0);
    }
    return pickCheckoutFee(apiAmount, bundleAmount, fallbackAmount);
};

/** Shared invoice math for step 5 display and Flutterwave — excludes legacy default fees. */
const computeBuyNowInvoiceTotals = ({
    invoiceDetails,
    productInvoiceRows = [],
    bundleNetTotal = 0,
    vatPercent = 7.5,
    bundleServiceFees = null,
    stateFeeFallback = null,
    catalogSubtotal = 0,
    bundleFeesOnly = false,
}) => {
    const rawFeeRows = [
        { description: 'Delivery fee', rate: Number(invoiceDetails?.delivery_fee || 0) },
        { description: 'Installation fee', rate: Number(invoiceDetails?.installation_fee || 0) },
        { description: 'Material cost', rate: Number(invoiceDetails?.material_cost || 0) },
        { description: 'Inspection fee', rate: Number(invoiceDetails?.inspection_fee || 0) },
    ];
    const billableFeeRows = filterBillableInvoiceFees(rawFeeRows);
    const billableFeesTotal = billableFeeRows.reduce((s, r) => s + Number(r.rate || 0), 0);

    const lineItemsSubtotal = productInvoiceRows.reduce((s, row) => s + Number(row.totalCost || 0), 0);
    const apiItemsSubtotal = Number(invoiceDetails?.items_subtotal_before_discount || 0);
    const catalogItemsSubtotal = Number(catalogSubtotal || 0);
    const subTotalBeforeDiscount = apiItemsSubtotal > 0
        ? apiItemsSubtotal
        : (catalogItemsSubtotal > 0
            ? catalogItemsSubtotal
            : bundleNetTotal + lineItemsSubtotal);

    const outrightDiscountPct = Number(invoiceDetails?.outright_discount_percentage || 0);
    const apiDiscountAmount = Number(invoiceDetails?.outright_discount_amount || 0);
    const effectiveOutrightDiscount = apiDiscountAmount > 0
        ? apiDiscountAmount
        : (outrightDiscountPct > 0 ? (subTotalBeforeDiscount * outrightDiscountPct) / 100 : 0);

    const apiInsurance = Number(invoiceDetails?.insurance_fee || 0);
    const insuranceAmount = apiInsurance > 0 ? apiInsurance : 0;
    const discountedSubTotal = Math.max(subTotalBeforeDiscount - effectiveOutrightDiscount, 0);

    const feeAmount = (needle) => {
        const row = billableFeeRows.find((r) =>
            String(r.description || '').toLowerCase().includes(needle)
        );
        return row ? Number(row.rate || 0) : 0;
    };
    const bundleFees = bundleServiceFees || {};
    const stateFees = bundleFeesOnly ? {} : (stateFeeFallback || {});
    const deliveryFee = pickBundleScopedFee(
        feeAmount('delivery'),
        bundleFees.deliveryFee,
        stateFees.deliveryFee,
        bundleFeesOnly
    );
    const installationFee = pickBundleScopedFee(
        feeAmount('installation'),
        bundleFees.installationFee,
        stateFees.installationFee,
        bundleFeesOnly
    );
    const materialCost = pickBundleScopedFee(
        feeAmount('material'),
        bundleFees.materialCost,
        stateFees.materialCost,
        bundleFeesOnly
    );
    const inspectionFee = pickBundleScopedFee(
        feeAmount('inspection'),
        bundleFees.inspectionFee,
        stateFees.inspectionFee,
        bundleFeesOnly
    );
    const serviceFeesTotal = deliveryFee + installationFee + materialCost + inspectionFee;

    const totalAmount = roundMoney(discountedSubTotal + serviceFeesTotal);
    const vatAmount = roundMoney((totalAmount * vatPercent) / 100);
    const grandTotal = roundMoney(totalAmount + vatAmount + insuranceAmount);

    return {
        billableFeeRows,
        billableFeesTotal: serviceFeesTotal,
        deliveryFee,
        installationFee,
        materialCost,
        inspectionFee,
        subTotalBeforeDiscount,
        effectiveOutrightDiscount,
        outrightDiscountPct,
        discountedSubTotal,
        totalAmount,
        insuranceAmount,
        vatBase: totalAmount,
        netTotal: totalAmount,
        vatAmount,
        grandTotal,
    };
};

const BuyNowLineItemsTable = ({ rows, emptyLabel = 'No items' }) => {
    if (!rows?.length) return null;
    return (
        <div className="overflow-x-auto border border-gray-200 rounded-lg mb-6">
            <table className="w-full text-left border-collapse text-sm">
                <thead>
                    <tr className="bg-gray-100 border-b border-gray-200">
                        <th className="py-3 px-4 font-semibold text-gray-700">Item description</th>
                        <th className="py-3 px-4 font-semibold text-gray-700 text-center w-16">Qty</th>
                        <th className="py-3 px-4 font-semibold text-gray-700 text-center w-16">Unit</th>
                        <th className="py-3 px-4 font-semibold text-gray-700 text-right w-28">Rate</th>
                        <th className="py-3 px-4 font-semibold text-gray-700 text-right w-32">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.id} className="border-b border-gray-100 even:bg-gray-50/60">
                            <td className="py-3 px-4 text-gray-800">{stripFeeVisibilityPrefix(row.description)}</td>
                            <td className="py-3 px-4 text-center text-gray-700">{row.quantity}</td>
                            <td className="py-3 px-4 text-center text-gray-600">{row.unit}</td>
                            <td className="py-3 px-4 text-right text-gray-700 tabular-nums">
                                {row.rate > 0 ? `₦${formatAmount(row.rate)}` : '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-gray-900 tabular-nums">
                                {row.totalCost > 0 ? `₦${formatAmount(row.totalCost)}` : '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// Format backup time text - split sentences by periods and display on separate lines with blank line between
const formatBackupTime = (text) => {
  if (!text) return "";
  // Split by periods followed by space, keep periods with sentences
  return text
    .split(/\.\s+/)
    .filter(s => s.trim().length > 0)
    .map(s => s.trim() + ".")
    .join("\n\n"); // Two newlines for blank line between sentences
};

// Helper to get bundle image (moved to component level for modal access)
const getBundleImage = (bundle) => {
    if (!bundle) return FALLBACK_IMAGE;
    
    // Extract base URL from API config (remove /api)
    const API_BASE = BASE_URL || 'http://127.0.0.1:8000/api';
    const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '') || 'http://127.0.0.1:8000';
    
    if (bundle.featured_image) {
        const path = bundle.featured_image;
        // Already absolute URL
        if (/^https?:\/\//i.test(path)) return path;
        // Path starts with / (e.g., "/storage/bundles/xyz.jpg")
        if (path.startsWith('/')) return `${API_ORIGIN}${path}`;
        // Path without leading slash
        const cleaned = path.replace(/^public\//, '');
        return `${API_ORIGIN}/storage/${cleaned}`;
    }
    // Return fallback image
    return FALLBACK_IMAGE;
};

// Helper to format price (moved to component level for modal access)
const formatPrice = (price) => {
    return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(price || 0));
};

const formatAmount = (value) =>
    Number(value || 0).toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

// Label map for bundle specifications (matches sheet "Bundle Specification" column)
const SPEC_LABELS = {
    company_oem: 'Company / OEM',
    solar_panel_type: 'Solar Panel type',
    inverter_capacity_kva: 'Inverter Capacity',
    voltage: 'Voltage',
    battery_type: 'Battery Type',
    solar_panels_warranty: 'Solar panels (Warranty)',
    inverter_warranty: 'Solar Inverter (Warranty)',
    battery_warranty: 'Lithium Ion Battery (Warranty)',
    solar_panels_wattage: 'Solar Panels Wattage',
    battery_capacity_kwh: 'Battery Capacity',
    backup_time_range: 'Back-up time range',
};
const BUNDLE_SPEC_ORDER = ['company_oem', 'solar_panel_type', 'inverter_capacity_kva', 'voltage', 'battery_type', 'solar_panels_warranty', 'inverter_warranty', 'battery_warranty', 'solar_panels_wattage', 'battery_capacity_kwh', 'backup_time_range'];
const SPEC_KEYS_HIDDEN = ['solar_panel_capacity_kw', 'solar_panel_capacity_w'];

const parseBundleSpecifications = (bundle) => {
    const raw = bundle?.specifications;
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }
    return {};
};

const normalizeSpecKey = (key) =>
    String(key ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

const getSpecValue = (specs, candidateKeys = []) => {
    if (!specs || typeof specs !== 'object') return undefined;

    for (const key of candidateKeys) {
        if (Object.prototype.hasOwnProperty.call(specs, key)) {
            const value = specs[key];
            if (value !== null && value !== undefined && value !== '') return value;
        }
    }

    const normalizedSpecMap = new Map(
        Object.entries(specs).map(([k, v]) => [normalizeSpecKey(k), v])
    );

    for (const key of candidateKeys) {
        const value = normalizedSpecMap.get(normalizeSpecKey(key));
        if (value !== null && value !== undefined && value !== '') return value;
    }

    return undefined;
};

const getBundleBatteryCapacity = (bundle) => {
    const specs = parseBundleSpecifications(bundle);
    return (
        bundle?.total_output ??
        bundle?.totalOutput ??
        getSpecValue(specs, [
            'battery_capacity_kwh',
            'battery_capacity',
            'battery_capacity_ah',
            'battery_capacity_wh',
            'battery',
            'battery_kwh',
            'Battery Capacity (kWh)',
            'Battery Capacity (Ah)',
            'Battery Capacity (Wh)',
            'Battery Capacity',
            'Battery (kWh)',
        ]) ??
        bundle?.battery_capacity_kwh ??
        bundle?.battery_capacity ??
        bundle?.battery_capacity_ah ??
        bundle?.battery_capacity_wh ??
        bundle?.battery ??
        '—'
    );
};

const getBundleInverterRating = (bundle) => {
    const specs = parseBundleSpecifications(bundle);
    return (
        bundle?.inver_rating ??
        getSpecValue(specs, [
            'inverter_capacity_kva',
            'inverter_rating',
            'Inverter Capacity (kVA)',
            'Inverter Capacity',
            'Inverter Rating',
            'Inverter Rating (kVA)',
        ]) ??
        '—'
    );
};

const getBundleSolarPanelCapacity = (bundle) => {
    const specs = parseBundleSpecifications(bundle);
    return (
        getSpecValue(specs, [
            'solar_panels_wattage',
            'solar_panel_capacity_kw',
            'solar_panel_capacity',
            'Solar Capacity (kW)',
            'Solar Panels Wattage',
            'Solar Panel Capacity (kW)',
            'Solar Capacity',
            'Solar Panel Capacity',
        ]) ??
        bundle?.solar_panels_wattage ??
        bundle?.solar_panel_capacity_kw ??
        '—'
    );
};

const BuyNowFlow = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [processingPayment, setProcessingPayment] = useState(false);
    const [invoiceDetails, setInvoiceDetails] = useState(null);
    const [orderId, setOrderId] = useState(null);
    const [orderFetchedLineItems, setOrderFetchedLineItems] = useState([]);
    const [calendarSlots, setCalendarSlots] = useState([]);
    const [calendarSlotsLoading, setCalendarSlotsLoading] = useState(false);
    const [paymentResult, setPaymentResult] = useState(null); // 'success' | 'failed' | null
    const [selectedSlot, setSelectedSlot] = useState(null);
    
    // Configuration data from API
    const [addOns, setAddOns] = useState([]);
    const [states, setStates] = useState([]);
    const [checkoutSettings, setCheckoutSettings] = useState(null);
    const [auditTypes, setAuditTypes] = useState([]);
    const [deliveryLocations, setDeliveryLocations] = useState([]);
    const [selectedStateId, setSelectedStateId] = useState(null);
    const [selectedAddOns, setSelectedAddOns] = useState([]);
    const [configLoading, setConfigLoading] = useState(false);
    const [auditRequestId, setAuditRequestId] = useState(null);
    const [auditRequests, setAuditRequests] = useState([]);
    const [auditRequestStatus, setAuditRequestStatus] = useState(null);
    const [checkingAuditStatus, setCheckingAuditStatus] = useState(false);
    
    // Enriched bundle details (full API data with custom_services / bundle_items)
    const [enrichedBundles, setEnrichedBundles] = useState({});
    const [enrichingBundles, setEnrichingBundles] = useState(false);

    // Custom order flow (from admin-created cart)
    const [searchParams] = useSearchParams();
    const [cartToken, setCartToken] = useState(null);
    const [cartItems, setCartItems] = useState([]);
    const [cartOrderType, setCartOrderType] = useState(null);
    const [cartLoading, setCartLoading] = useState(false);
    const [cartError, setCartError] = useState(null);

    const [formData, setFormData] = useState({
        customerType: '',
        productCategory: '', // 'full-kit', 'inverter-battery', 'battery-only', 'inverter-only', 'panels-only'
        optionType: '', // 'choose-system', 'build-system', 'audit'
        auditType: '', // 'home-office', 'commercial'
        auditSubtype: '',
        companyName: '',
        facilityDescription: '',
        buildingType: '',
        commercialAddress: '',
        officeAddress: '',
        officeSpaces: '',
        selectedProductPrice: 0,
        selectedBundleId: null,
        selectedBundle: null,
        selectedProductId: null,
        selectedProduct: null,
        selectedBundles: [], // Array of selected bundles [{id, bundle, price}, ...]
        selectedProducts: [], // Array of selected products [{id, product, price}, ...]
        singleItemQuantity: 1, // Quantity for single item (fallback case)
        installerChoice: '', // 'troosolar', 'own'
        includeInsurance: false,
        includeInstallationMaterial: false,
        includeInspection: true,
        fullName: '',
        phone: '',
        address: '',
        state: '',
        stateId: null,
        deliveryLocationId: null,
        houseNo: '',
        landmark: '',
        floors: '',
        rooms: '',
        isGatedEstate: false,
        estateName: '',
        estateAddress: '',
        streetName: '', // Street name for property address
        preferredAuditDate: '',
        preferredAuditTime: '',
    });

    // Bundles for selection
    const [bundles, setBundles] = useState([]);
    const [bundlesLoading, setBundlesLoading] = useState(false);
    const [selectedBundleDetails, setSelectedBundleDetails] = useState(null); // For "Learn More" modal
    const [bundleDetailTab, setBundleDetailTab] = useState('description'); // 'description' | 'specs'
    const [selectedSystemSize, setSelectedSystemSize] = useState("all"); // System size filter
    const [bundleGridPage, setBundleGridPage] = useState(1);
    const [productGridPage, setProductGridPage] = useState(1);
    const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false);
    const sizeDropdownRef = useRef(null);
    const [showBundleSelectPrompt, setShowBundleSelectPrompt] = useState(false);
    const [lastSelectedBundleName, setLastSelectedBundleName] = useState('');

    // Defensive guard: never remain on step 3.6 without details data.
    useEffect(() => {
        if (step === 3.6 && !selectedBundleDetails) {
            setStep(3.5);
        }
    }, [step, selectedBundleDetails]);

    // Categories and products for individual components
    const [categories, setCategories] = useState([]);
    const [categoryProducts, setCategoryProducts] = useState([]);
    const [productsLoading, setProductsLoading] = useState(false);
    const [selectedCategoryId, setSelectedCategoryId] = useState(null);
    
    // Material categories and materials for "Build Your Own System"
    const [materialCategories, setMaterialCategories] = useState([]);
    const [categoryMaterials, setCategoryMaterials] = useState([]);
    const [materialsLoading, setMaterialsLoading] = useState(false);
    const [selectedMaterialCategoryId, setSelectedMaterialCategoryId] = useState(null);
    const [selectedMaterials, setSelectedMaterials] = useState([]); // [{material_id, quantity}, ...]
    const [allMaterialsMap, setAllMaterialsMap] = useState({}); // Store all materials by ID for cart display
    const [customBundleCalculation, setCustomBundleCalculation] = useState(null);

    // Check for custom order flow (cart token) on mount
    React.useEffect(() => {
        const token = searchParams.get('token');
        const type = searchParams.get('type');
        
        if (token && (type === 'buy_now' || type === 'bnpl')) {
            setCartToken(token);
            setCartOrderType(type);
            verifyCartAccess(token, type);
        }
    }, [searchParams]);

    // Verify cart access and load cart items (admin custom-order email deep link)
    const verifyCartAccess = async (token, orderType = 'buy_now') => {
        setCartLoading(true);
        setCartError(null);
        try {
            const userToken = localStorage.getItem('access_token');
            const response = await axios.get(API.CART_ACCESS(token), {
                headers: {
                    Accept: 'application/json',
                    ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
                },
            });

            if (response.data.status === 'success') {
                const cartData = response.data.data;

                persistSessionFromCartAccess(cartData);

                const stepParam = searchParams.get('step');
                const parsedStep = Number(stepParam || 4);
                const validSteps = new Set([1, 2, 2.5, 2.75, 3, 3.5, 3.6, 3.75, 4, 5, 6, 7, 7.5, 8]);
                const landStep = Number.isFinite(parsedStep) && validSteps.has(parsedStep) ? parsedStep : 4;
                const returnPath = `/buy-now?token=${encodeURIComponent(token)}&type=${encodeURIComponent(orderType)}&step=${landStep}`;

                if (cartData.requires_login) {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('user');
                    navigate(loginPathWithReturn(returnPath));
                    return;
                }

                // Store cart items
                setCartItems(cartData.cart_items || []);
                
                // Pre-populate form with cart items if available
                if (cartData.cart_items && cartData.cart_items.length > 0) {
                    const products = [];
                    const bundles = [];
                    
                    cartData.cart_items.forEach(item => {
                        const qty = Math.max(1, Number(item.quantity || 1));
                        const sub = Number(item.subtotal) || 0;
                        const unit = Number(item.unit_price) || 0;
                        const unitPrice = sub > 0 ? sub / qty : unit;
                        if (item.type === 'product' && item.itemable) {
                            products.push({
                                id: item.itemable_id,
                                product: item.itemable,
                                price: unitPrice,
                                quantity: qty,
                            });
                        } else if (item.type === 'bundle' && item.itemable) {
                            bundles.push({
                                id: item.itemable_id,
                                bundle: item.itemable,
                                price: unitPrice,
                                quantity: qty,
                            });
                        }
                    });
                    
                    if (products.length > 0 || bundles.length > 0) {
                        const totalPrice = [...products, ...bundles].reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
                        const primaryBundle = bundles[0];
                        const audit = cartData.audit_request || cartData.latest_audit_request || null;
                        const auditCustomerType = String(audit?.customer_type || '').toLowerCase();
                        const resolvedCustomerType = ['residential', 'sme', 'commercial'].includes(auditCustomerType)
                            ? auditCustomerType
                            : (audit?.audit_type === 'commercial' ? 'commercial' : null);
                        const auditCategory = String(audit?.product_category || '').toLowerCase();
                        const validCategories = ['full-kit', 'inverter-battery', 'battery-only', 'inverter-only', 'panels-only'];

                        if (audit?.id) {
                            setAuditRequestId(audit.id);
                        }

                        setFormData(prev => ({
                            ...prev,
                            selectedProducts: products,
                            selectedBundles: bundles,
                            selectedBundleId: primaryBundle?.id ?? prev.selectedBundleId,
                            selectedBundle: primaryBundle?.bundle ?? prev.selectedBundle,
                            selectedProductPrice: totalPrice,
                            // Prefer audit request — do not hardcode residential for custom-order links
                            customerType: resolvedCustomerType || prev.customerType || 'residential',
                            auditRequestId: audit?.id || prev.auditRequestId,
                            auditType: audit?.audit_type || prev.auditType,
                            optionType: 'choose-system',
                            productCategory: (validCategories.includes(auditCategory) ? auditCategory : null)
                                || prev.productCategory
                                || 'full-kit',
                            installerChoice: prev.installerChoice || 'troosolar',
                            includeInsurance: prev.includeInsurance || false,
                            includeInspection: prev.includeInspection !== undefined ? prev.includeInspection : true,
                            state: prev.state || audit?.property_state || '',
                            floors: prev.floors || (audit?.property_floors != null ? String(audit.property_floors) : ''),
                            rooms: prev.rooms || (audit?.property_rooms != null ? String(audit.property_rooms) : ''),
                            isGatedEstate: prev.isGatedEstate || !!audit?.is_gated_estate,
                            estateName: prev.estateName || audit?.estate_name || '',
                            estateAddress: prev.estateAddress || audit?.estate_address || '',
                            fullName: prev.fullName || audit?.contact_name || '',
                            phone: prev.phone || audit?.contact_phone || '',
                        }));
                        // Stay in Buy Now (same path as catalog Buy Now after selection)
                        if (orderType === 'buy_now') {
                            setStep(landStep);
                        }
                    }
                }
            } else {
                setCartError(response.data.message || 'Failed to access cart');
            }
        } catch (error) {
            console.error('Cart access error:', error);
            setCartError(error.response?.data?.message || 'Invalid or expired cart link');
        } finally {
            setCartLoading(false);
        }
    };

    // Handle bundleId and editBundle / fromBundle parameters
    React.useEffect(() => {
        const bundleId = searchParams.get('bundleId');
        const editBundle = searchParams.get('editBundle');
        const fromBundle = searchParams.get('fromBundle');
        const stepParam = searchParams.get('step');
        
        if (bundleId && editBundle === 'true') {
            // Load bundle and its products for editing
            const loadBundleForEditing = async () => {
                try {
                    const token = localStorage.getItem('access_token');
                    const response = await axios.get(API.BUNDLE_BY_ID(bundleId), {
                        headers: {
                            Accept: 'application/json',
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                    });
                    
                    const bundleData = response.data?.data ?? response.data;
                    if (bundleData) {
                        // Extract products from bundle
                        const bundleItems = bundleData.bundleItems ?? bundleData.bundle_items ?? [];
                        const products = bundleItems
                            .filter(item => item?.product)
                            .map(item => ({
                                id: item.product.id,
                                product: item.product,
                                price: Number(item.product.discount_price || item.product.price || 0),
                                quantity: Number(item.quantity || 1)
                            }));
                        
                        if (products.length > 0) {
                            const totalPrice = products.reduce((sum, p) => sum + (p.price * p.quantity), 0);
                            setFormData(prev => ({
                                ...prev,
                                selectedProducts: products,
                                selectedBundleId: Number(bundleId),
                                selectedBundle: bundleData,
                                selectedProductPrice: totalPrice
                            }));
                        }
                        
                        // Navigate to step if provided, otherwise go to category selection
                        if (stepParam) {
                            setStep(Number(stepParam));
                        } else {
                            setStep(2); // Category selection
                        }
                    }
                } catch (error) {
                    console.error('Failed to load bundle for editing:', error);
                    alert('Failed to load bundle details. Please try again.');
                }
            };
            
            loadBundleForEditing();
        } else if (bundleId && (fromBundle === 'true' || stepParam === '4' || stepParam === '7')) {
            // Coming from ProductBundle detail page (Buy Now): preload bundle details,
            // then continue at requested step (default step 4 for installer/insurance).
            const loadBundleForOrderSummary = async () => {
                try {
                    const token = localStorage.getItem('access_token');
                    const response = await axios.get(API.BUNDLE_DETAILS(bundleId), {
                        headers: {
                            Accept: 'application/json',
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                    });
                    const bundleData = response.data?.data ?? response.data?.data ?? response.data;
                    if (bundleData) {
                        const totalPrice = Number(bundleData.discount_price || bundleData.total_price || 0);
                        const bundleForSelection = {
                            id: bundleData.id,
                            bundle: bundleData,
                            price: totalPrice,
                            quantity: 1,
                        };
                        setFormData(prev => ({
                            ...prev,
                            selectedBundles: [bundleForSelection],
                            selectedBundleId: Number(bundleId),
                            selectedBundle: bundleData,
                            selectedProductPrice: totalPrice,
                            optionType: prev.optionType || 'choose-system',
                            productCategory: prev.productCategory || 'full-kit',
                            installerChoice: prev.installerChoice || 'troosolar',
                            includeInsurance: prev.includeInsurance || false,
                            includeInspection: prev.includeInspection !== undefined ? prev.includeInspection : true,
                        }));
                        // Cache the full bundle detail so extractBundleLineItems gets custom_services
                        setEnrichedBundles({ [bundleData.id]: bundleData });
                        const nextStep = Number(stepParam || 4);
                        setStep(Number.isFinite(nextStep) ? nextStep : 4);
                    }
                } catch (error) {
                    console.error('Failed to load bundle for order summary:', error);
                    alert('Failed to load bundle details. Please try again.');
                }
            };
            loadBundleForOrderSummary();
        } else if (stepParam) {
            const parsedStep = Number(stepParam);
            const qParam = searchParams.get('q');
            const categoryParam = searchParams.get('category');
            const validSteps = new Set([1, 2, 2.5, 2.75, 3, 3.5, 3.6, 3.75, 4, 5, 6, 7, 7.5, 8]);
            const resolvedCategory = categoryParam && ['full-kit', 'inverter-battery', 'battery-only', 'inverter-only', 'panels-only'].includes(categoryParam)
                ? categoryParam
                : undefined;

            let nextStep = parsedStep;
            if (!Number.isFinite(nextStep) || !validSteps.has(nextStep)) {
                // Defensive fallback for malformed calculator/back links like step=0.
                nextStep = resolvedCategory
                    ? (['full-kit', 'inverter-battery'].includes(resolvedCategory) ? 3 : 2)
                    : 1;
            }

            setStep(nextStep);

            if (resolvedCategory || qParam) {
                setFormData(prev => ({
                    ...prev,
                    optionType: (nextStep === 3.5 || nextStep === 3.6 || nextStep === 4 || nextStep === 7 || nextStep === 7.5 || nextStep === 8)
                        ? (prev.optionType || 'choose-system')
                        : prev.optionType,
                    productCategory: resolvedCategory ?? prev.productCategory ?? 'full-kit',
                    customerType: prev.customerType || 'residential',
                }));
            }
        }
    }, [searchParams]);

    // Fetch categories and audit types on mount
    React.useEffect(() => {
        const fetchData = async () => {
            try {
                const token = localStorage.getItem('access_token');
                const [categoriesRes, auditRes] = await Promise.all([
                    axios.get(API.CATEGORIES, {
                        headers: {
                            Accept: 'application/json',
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                    }).catch(() => ({ data: { status: 'error' }, status: 404 })),
                    axios.get(API.CONFIG_AUDIT_TYPES).catch(() => ({ data: { status: 'error' }, status: 404 }))
                ]);
                
                const catList = Array.isArray(categoriesRes.data?.data) ? categoriesRes.data.data : [];
                setCategories(catList);
                
                if (auditRes.status !== 404 && auditRes.data?.status === 'success') {
                    setAuditTypes(auditRes.data.data);
                } else {
                    // Fallback to defaults
                    setAuditTypes([
                        { id: 'home-office', label: 'Home / Office' },
                        { id: 'commercial', label: 'Commercial / Industrial' }
                    ]);
                }
            } catch (error) {
                console.error("Failed to fetch data:", error);
            }
        };
        fetchData();
    }, []);

    // Map predefined category groups to API category IDs (same as BNPL)
    const getCategoryIdsForGroup = (groupType) => {
        const categoryIds = {
            'full-kit': [], // Solar panels, inverter, and battery solution
            'inverter-battery': [], // Inverter and battery solution
            'battery-only': [], // Battery only
            'inverter-only': [], // Inverter only
            'panels-only': [], // Solar panels only
        };

        const isBatteryCategory = (name) =>
            name.includes('battery') ||
            name.includes('batteries') ||
            name.includes('lithium') ||
            name.includes('battries');

        // Find matching categories from API
        categories.forEach(cat => {
            const name = (cat.title || cat.name || '').toLowerCase();
            
            // Full kit: Solar, Inverters, Batteries
            if (groupType === 'full-kit') {
                if (name.includes('solar') || name.includes('panel') || 
                    name.includes('inverter') || isBatteryCategory(name)) {
                    categoryIds['full-kit'].push(cat.id);
                }
            }
            // Inverter & Battery: Inverters, Batteries
            else if (groupType === 'inverter-battery') {
                if (name.includes('inverter') || isBatteryCategory(name)) {
                    categoryIds['inverter-battery'].push(cat.id);
                }
            }
            // Battery only
            else if (groupType === 'battery-only') {
                if (isBatteryCategory(name)) {
                    categoryIds['battery-only'].push(cat.id);
                }
            }
            // Inverter only
            else if (groupType === 'inverter-only') {
                if (name.includes('inverter')) {
                    categoryIds['inverter-only'].push(cat.id);
                }
            }
            // Panels only
            else if (groupType === 'panels-only') {
                if (name.includes('solar') || name.includes('panel')) {
                    categoryIds['panels-only'].push(cat.id);
                }
            }
        });

        return Array.from(new Set(categoryIds[groupType] || []));
    };

    // Map product category string to category name/id (OLD - COMMENTED OUT BUT KEPT FOR REFERENCE)
    // const getCategoryIdFromProductCategory = (productCategory) => {
    //     const categoryMap = {
    //         'battery-only': ['battery', 'batteries'],
    //         'inverter-only': ['inverter', 'inverters'],
    //         'panels-only': ['solar panel', 'panels', 'solar panels'],
    //     };
    //     
    //     const searchTerms = categoryMap[productCategory] || [];
    //     if (searchTerms.length === 0) return null;
    //     
    //     // Find category by matching name (case-insensitive)
    //     const found = categories.find(cat => {
    //         const name = (cat.name || cat.title || '').toLowerCase();
    //         return searchTerms.some(term => name.includes(term));
    //     });
    //     
    //     return found?.id || null;
    // };

    // --- Handlers ---

    const handleCustomerTypeSelect = (type) => {
        if (type === 'commercial') {
            setInvoiceDetails(null); // avoid stale checkout state leaking into audit-only UI
            setFormData((prev) => ({
                ...prev,
                customerType: 'commercial',
                optionType: 'audit',
                auditType: 'commercial',
                auditSubtype: '',
                productCategory: prev.productCategory || 'full-kit',
            }));
            setStep(5); // Commercial/Industrial audit form — skip 5 category options & method step
            return;
        }
        setFormData((prev) => ({ ...prev, customerType: type }));
        setStep(2); // Go to Solar Solution Selection (5 options)
    };

    // NEW: Handle solar solution group selection (5 predefined options)
    const handleCategorySelect = async (groupType) => {
        // groupType can be: 'full-kit', 'inverter-battery', 'battery-only', 'inverter-only', 'panels-only'
        const isProductOnlyPath = ['battery-only', 'inverter-only', 'panels-only'].includes(groupType);
        setFormData({
            ...formData,
            productCategory: groupType,
            // Keep bundle vs product flows fully separated
            ...(isProductOnlyPath ? {
                selectedBundles: [],
                selectedBundleId: null,
                selectedBundle: null,
                optionType: '',
            } : {}),
        });

        // For full-kit and inverter-battery, go to Action Selection (Step 3)
        if (groupType === 'full-kit' || groupType === 'inverter-battery') {
            setStep(3); // Action Selection (Choose/Build/Audit)
        } else {
            // For individual components (battery-only, inverter-only, panels-only), fetch products
            const categoryIds = getCategoryIdsForGroup(groupType);
            
            if (categoryIds.length === 0) {
                alert("No matching categories found. Please try again.");
                return;
            }

            // If only one category matches, use it directly
            // If multiple categories match, we'll fetch products from all of them
            setSelectedCategoryId(categoryIds[0]); // Store first category ID for reference
            
            // Clear previous products and set loading state BEFORE navigating
            setCategoryProducts([]);
            setProductsLoading(true);
            setStep(2.5); // Navigate to Product Selection step first to show loading
            
            try {
                let allProducts = [];

                // First, use dedicated public group endpoint for these option cards
                try {
                    const groupRes = await axios.get(API.PRODUCTS_BY_GROUP(groupType), {
                        headers: { Accept: 'application/json' },
                    });
                    const groupRoot = groupRes.data?.data ?? groupRes.data;
                    const groupProducts = Array.isArray(groupRoot)
                        ? groupRoot
                        : Array.isArray(groupRoot?.data)
                            ? groupRoot.data
                            : [];
                    allProducts = groupProducts;
                } catch (groupErr) {
                    console.warn(`Failed to fetch products by group (${groupType}):`, groupErr);
                }

                // Intentionally no category/product fallback for individual-component cards.
                // These flows must rely only on the grouped endpoint to avoid mismatched records.

                const uniqueProducts = dedupeProductsById(allProducts);
                setCategoryProducts(uniqueProducts);
            } catch (error) {
                console.error("Failed to fetch products:", error);
                alert("Failed to load products. Please try again.");
                setCategoryProducts([]); // Ensure empty array on error
            } finally {
                setProductsLoading(false);
            }
        }
    };

    // OLD: Handle API category selection (for "Build my solar system" path)
    // const handleCategorySelect = async (categoryId) => {
    //     // categoryId is now the actual category ID from the API
    //     const selectedCategory = categories.find(cat => cat.id === categoryId);
    //     if (!selectedCategory) {
    //         alert("Category not found. Please try again.");
    //         return;
    //     }

    //     setFormData({ ...formData, productCategory: selectedCategory.title || selectedCategory.name });
    //     setSelectedCategoryId(categoryId);
    //     
    //     // Clear previous products and set loading state BEFORE navigating
    //     setCategoryProducts([]);
    //     setProductsLoading(true);
    //     setStep(2.5); // Navigate to Product Selection step first to show loading
    //     
    //     try {
    //         const token = localStorage.getItem('access_token');
    //         // Try to fetch products by category
    //         let products = [];
    //         try {
    //             const response = await axios.get(API.CATEGORY_PRODUCTS(categoryId), {
    //                 headers: {
    //                     Accept: 'application/json',
    //                     ...(token ? { Authorization: `Bearer ${token}` } : {}),
    //                 },
    //             });
    //             const root = response.data?.data ?? response.data;
    //             products = Array.isArray(root) ? root : Array.isArray(root?.data) ? root.data : [];
    //         } catch (err) {
    //             // Fallback: fetch all products and filter by category
    //             const allProductsRes = await axios.get(API.PRODUCTS, {
    //                 headers: {
    //                     Accept: 'application/json',
    //                     ...(token ? { Authorization: `Bearer ${token}` } : {}),
    //                 },
    //             });
    //             const allProducts = Array.isArray(allProductsRes.data?.data) ? allProductsRes.data.data : [];
    //             products = allProducts.filter(p => String(p.category_id) === String(categoryId));
    //         }
    //         setCategoryProducts(products);
    //     } catch (error) {
    //         console.error("Failed to fetch products:", error);
    //         alert("Failed to load products. Please try again.");
    //         setCategoryProducts([]); // Ensure empty array on error
    //     } finally {
    //         setProductsLoading(false);
    //     }
    // };

    // Handle material category selection for "Build Your Own System"
    const handleMaterialCategorySelect = async (categoryId) => {
        setSelectedMaterialCategoryId(categoryId);
        setCategoryMaterials([]);
        setMaterialsLoading(true);
        setStep(3.75);
        // Don't clear selectedMaterials - keep selections when switching categories // Navigate to Material Selection step
        
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                alert("Please login to continue");
                navigate('/login');
                return;
            }
            
            // Fetch materials by category
            const response = await axios.get(API.MATERIALS_BY_CATEGORY(categoryId), {
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                },
            });
            
            const root = response.data?.data ?? response.data;
            const materials = Array.isArray(root) ? root : Array.isArray(root?.data) ? root.data : [];
            setCategoryMaterials(sortProductsByPromoFirst(materials));
            
            // Store materials in map for cart display (preserve across category changes)
            setAllMaterialsMap(prev => {
                const updated = { ...prev };
                materials.forEach(m => {
                    if (m.id) {
                        updated[m.id] = m;
                    }
                });
                return updated;
            });
        } catch (error) {
            console.error("Failed to fetch materials:", error);
            alert("Failed to load materials. Please try again.");
            setCategoryMaterials([]);
        } finally {
            setMaterialsLoading(false);
        }
    };

    // NEW: Handle API category selection for "Build my solar system" path
    const handleBuildSystemCategorySelect = async (categoryId) => {
        // categoryId is now the actual category ID from the API
        const selectedCategory = categories.find(cat => cat.id === categoryId);
        if (!selectedCategory) {
            alert("Category not found. Please try again.");
            return;
        }

        setFormData({ ...formData, productCategory: selectedCategory.title || selectedCategory.name });
        setSelectedCategoryId(categoryId);
        
        // Clear previous products and set loading state BEFORE navigating
        setCategoryProducts([]);
        setProductsLoading(true);
        setStep(2.5); // Navigate to Product Selection step first to show loading
        
        try {
            const token = localStorage.getItem('access_token');
            // Try to fetch products by category
            let products = [];
            try {
                const response = await axios.get(API.CATEGORY_PRODUCTS(categoryId), {
                    headers: {
                        Accept: 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                });
                const root = response.data?.data ?? response.data;
                products = Array.isArray(root) ? root : Array.isArray(root?.data) ? root.data : [];
            } catch (err) {
                // Fallback: fetch all products and filter by category
                const allProductsRes = await axios.get(API.PRODUCTS, {
                    headers: {
                        Accept: 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                });
                const allProducts = Array.isArray(allProductsRes.data?.data) ? allProductsRes.data.data : [];
                products = allProducts.filter(p => String(p.category_id) === String(categoryId));
            }
            setCategoryProducts(dedupeProductsById(products));
        } catch (error) {
            console.error("Failed to fetch products:", error);
            alert("Failed to load products. Please try again.");
            setCategoryProducts([]); // Ensure empty array on error
        } finally {
            setProductsLoading(false);
        }
    };

    const bundlesFetchedRef = useRef(false);
    const bundlesNeedRefreshRef = useRef(false);
    const bundlesSnapshotRef = useRef([]);

    // System size options derived from actual bundles (only sizes we have)
    const sizeOptions = useMemo(() => {
        const sizeSet = new Set();
        bundles.forEach((bundle) => {
            const size = extractKvaFromBundle(bundle);
            if (size > 0 && Number.isFinite(size)) {
                const rounded = Number(size.toFixed(1));
                sizeSet.add(rounded);
            }
        });
        const sorted = Array.from(sizeSet).sort((a, b) => a - b);
        const options = sorted.map((val) => ({
            label: `${val}kVA`,
            value: val.toString(),
        }));
        return [{ label: "All Sizes", value: "all" }, ...options];
    }, [bundles]);

    // Filter by size, then ascending kVA (smallest → largest).
    const filteredBundles = useMemo(() => {
        let list;
        if (selectedSystemSize === "all") {
            list = bundles;
        } else {
            const targetSize = parseFloat(selectedSystemSize);
            if (isNaN(targetSize)) {
                list = bundles;
            } else {
                list = bundles.filter((bundle) => {
                    const bundleSize = extractKvaFromBundle(bundle);
                    if (bundleSize <= 0) return false;
                    const tolerance = 0.3;
                    return Math.abs(bundleSize - targetSize) <= tolerance;
                });
            }
        }
        return sortBundlesFeaturedThenKvaAsc(list);
    }, [bundles, selectedSystemSize]);

    useEffect(() => {
        setBundleGridPage(1);
    }, [selectedSystemSize, bundles]);

    useEffect(() => {
        const total = Math.max(1, Math.ceil(filteredBundles.length / BUNDLE_STEP_GRID_PAGE_SIZE));
        setBundleGridPage((p) => (p > total ? total : p));
    }, [filteredBundles.length]);

    const orderedCategoryProducts = useMemo(
        () => sortCategoryProducts(categoryProducts, formData.productCategory),
        [categoryProducts, formData.productCategory]
    );
    const orderedCategoryMaterials = useMemo(
        () => sortProductsByPromoFirst(categoryMaterials),
        [categoryMaterials]
    );

    useEffect(() => {
        setProductGridPage(1);
    }, [formData.productCategory, categoryProducts.length]);

    useEffect(() => {
        const total = Math.max(1, Math.ceil(orderedCategoryProducts.length / BUNDLE_STEP_GRID_PAGE_SIZE));
        setProductGridPage((p) => (p > total ? total : p));
    }, [orderedCategoryProducts.length]);

    // Close size dropdown if clicked outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (sizeDropdownRef.current && !sizeDropdownRef.current.contains(event.target)) {
                setIsSizeDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Audit handlers (same as BNPL)
    const handleAuditTypeSelect = (subtype) => {
        setInvoiceDetails(null);
        setFormData({ ...formData, auditType: 'home-office', auditSubtype: subtype });
        setStep(5);
    };

    const fetchAuditRequests = async (forRequestId) => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) return;

            const response = await axios.get(API.AUDIT_REQUESTS, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json'
                }
            });

            if (response.data.status === 'success') {
                const requests = Array.isArray(response.data.data) ? response.data.data : [];
                setAuditRequests(requests);
                
                const idToMatch = forRequestId ?? auditRequestId;
                if (idToMatch) {
                    const currentRequest = requests.find(req => req.id === idToMatch);
                    if (currentRequest) {
                        setAuditRequestStatus(currentRequest.status || currentRequest.audit_status);
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching audit requests:", error);
        }
    };

    const handleCheckAuditRequestStatus = async (requestIdFromUI) => {
        const requestId = requestIdFromUI || auditRequestId || formData.auditRequestId;
        if (!requestId) {
            alert('Request ID is not available on this screen yet. Opening Audit requests so you can track your submissions.');
            navigate('/more?section=auditRequests');
            return;
        }

        setCheckingAuditStatus(true);
        let openAuditTab = true;
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                alert('Please log in to check audit request status.');
                navigate('/login');
                openAuditTab = false;
                return;
            }

            const response = await axios.get(API.AUDIT_REQUEST_BY_ID(requestId), {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.data?.status === 'success') {
                const status = response.data?.data?.status || 'pending';
                alert(
                    status === 'approved'
                        ? 'Your audit request has been approved. Opening Audit requests for details.'
                        : `Your audit request is currently ${status}. Opening Audit requests for details.`
                );
            } else {
                alert('Could not fetch status right now. Opening Audit requests.');
            }
        } catch (error) {
            console.error('Failed to check audit status:', error);
            alert('Failed to fetch audit request status right now. Opening Audit requests.');
        } finally {
            setCheckingAuditStatus(false);
        }
        if (openAuditTab) {
            navigate(`/more?section=auditRequests&auditRequestId=${encodeURIComponent(requestId)}`);
        }
    };

    const handleAuditAddressSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                alert("Please login to continue");
                navigate('/login');
                return;
            }

            const isCommercial = formData.auditType === 'commercial';
            const isOffice = formData.auditType === 'home-office' && formData.auditSubtype === 'office';
            const isHome = formData.auditType === 'home-office' && !isOffice;

            let fullAddress = '';
            if (isCommercial) {
                fullAddress = (formData.commercialAddress || '').trim();
            } else if (isOffice) {
                fullAddress = (formData.officeAddress || '').trim();
            } else {
                fullAddress = [formData.houseNo, formData.streetName].filter(Boolean).join(', ');
            }

            const auditRequestPayload = {
                audit_type: formData.auditType,
                customer_type: formData.customerType,
                product_category: formData.productCategory || undefined,
                source: 'buy_now',
                property_state: formData.state,
                property_address: fullAddress || formData.address,
                property_landmark: formData.landmark || '',
                property_floors: isCommercial ? null : (formData.floors ? Number(formData.floors) : null),
                property_rooms: isCommercial
                    ? null
                    : isOffice
                        ? (formData.officeSpaces ? Number(formData.officeSpaces) : null)
                        : (formData.rooms ? Number(formData.rooms) : null),
                contact_name: (formData.fullName || '').trim(),
                contact_phone: (formData.phone || '').trim(),
                is_gated_estate: (isHome || isOffice) ? !!formData.isGatedEstate : false,
            };

            if (formData.auditType === 'home-office') {
                auditRequestPayload.audit_subtype = isOffice ? 'office' : 'home';
            }
            if (isCommercial || isOffice) {
                auditRequestPayload.company_name = (formData.companyName || '').trim();
            }
            if (isCommercial) {
                auditRequestPayload.facility_description = (formData.facilityDescription || '').trim();
            }
            if (isOffice || isHome) {
                auditRequestPayload.building_type = (formData.buildingType || '').trim();
            }

            if ((isHome || isOffice) && formData.isGatedEstate) {
                auditRequestPayload.estate_name = formData.estateName;
                auditRequestPayload.estate_address = formData.estateAddress;
            }

            auditRequestPayload.preferred_audit_date = formData.preferredAuditDate;
            auditRequestPayload.preferred_audit_time = formData.preferredAuditTime;

            // Add cart token if this is a custom order flow
            if (cartToken) {
                auditRequestPayload.cart_token = cartToken;
            }

            const auditRequestResponse = await axios.post(API.AUDIT_REQUEST, auditRequestPayload, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                }
            });

            if (auditRequestResponse.data.status === 'success') {
                const auditRequestId = auditRequestResponse.data.data.id;
                setAuditRequestId(auditRequestId);
                setFormData((prev) => ({ ...prev, auditRequestId }));
                await fetchAuditRequests(auditRequestId);
                // Same confirmation screen for home, office, and commercial audit requests
                setStep(6);
            } else {
                alert("Failed to submit audit request. Please try again.");
            }
        } catch (error) {
            console.error("Audit request submission error:", error);
            const errorMessage = error.response?.data?.message || 
                                (error.response?.data?.errors ? JSON.stringify(error.response.data.errors) : null) ||
                                "Failed to submit audit request. Please check all required fields.";
            alert(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleOptionSelect = async (option) => {
        setFormData(prev => ({ ...prev, optionType: option }));
        if (option === 'choose-system') {
            bundlesNeedRefreshRef.current = true;
            bundlesFetchedRef.current = false;
            setStep(3.5);
        } else if (option === 'build-system') {
            // Fetch material categories for building a custom system
            setMaterialCategories([]);
            setMaterialsLoading(true);
            setStep(2.75); // Navigate to Material Category Selection step
            
            try {
                const token = localStorage.getItem('access_token');
                
                // Fetch material categories (requires auth)
                const response = await axios.get(API.MATERIAL_CATEGORIES, {
                    headers: {
                        Accept: 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                });
                
                const root = response.data?.data ?? response.data;
                const categories = Array.isArray(root) ? root : Array.isArray(root?.data) ? root.data : [];
                setMaterialCategories(categories);
            } catch (error) {
                console.error("Failed to fetch material categories:", error);
                // Fallback to product categories if material categories endpoint fails
                if (categories.length > 0) {
                    setMaterialCategories(categories.map(cat => ({ id: cat.id, name: cat.title || cat.name, code: cat.code || '' })));
                } else {
                    alert("Failed to load material categories. Please try again.");
                }
            } finally {
                setMaterialsLoading(false);
            }
        } else if (option === 'audit') {
            setInvoiceDetails(null); // audit path never uses bundle checkout invoice
            if (formData.customerType === 'commercial') {
                setFormData((prev) => ({
                    ...prev,
                    optionType: 'audit',
                    auditType: 'commercial',
                    auditSubtype: '',
                }));
                setStep(5);
            } else {
                setFormData((prev) => ({ ...prev, optionType: 'audit' }));
                setStep(4);
            }
        }
    };

    const handleBundleSelect = (bundle) => {
        const price = Number(bundle.discount_price || bundle.total_price || 0);
        const wasAlreadySelected = formData.selectedBundleId === bundle.id;
        setFormData(prev => {
            const isSelected = prev.selectedBundleId === bundle.id;
            if (isSelected) {
                return {
                    ...prev,
                    selectedBundleId: null,
                    selectedBundle: null,
                    selectedBundles: [],
                    selectedProductPrice: 0,
                    singleItemQuantity: 1,
                };
            }

            return {
                ...prev,
                selectedBundleId: bundle.id,
                selectedBundle: bundle,
                selectedBundles: [{
                    id: bundle.id,
                    bundle: bundle,
                    price: price,
                    quantity: 1,
                }],
                selectedProductPrice: price,
                singleItemQuantity: 1,
            };
        });

        if (!wasAlreadySelected) {
            setLastSelectedBundleName(bundle?.title || bundle?.name || 'Selected bundle');
            setShowBundleSelectPrompt(true);
        }
    };

    const handleProductSelect = (product) => {
        const price = Number(product.discount_price || product.price || 0);
        setFormData(prev => {
            // Check if product is already selected
            const isSelected = prev.selectedProducts.some(p => p.id === product.id);
            
            let updatedProducts;
            if (isSelected) {
                // Remove product if already selected
                updatedProducts = prev.selectedProducts.filter(p => p.id !== product.id);
            } else {
                // Add product if not selected
                updatedProducts = [...prev.selectedProducts, {
                    id: product.id,
                    product: product,
                    price: price,
                    quantity: 1,
                    feeCategory: inferProductFeeCategory(product, prev.productCategory),
                }];
            }
            
            // Calculate total price from all selected bundles and products (accounting for quantity)
            const bundlesTotal = prev.selectedBundles.reduce((sum, b) => sum + (b.price * (b.quantity || 1)), 0);
            const productsTotal = updatedProducts.reduce((sum, p) => sum + (p.price * (p.quantity || 1)), 0);
            const totalPrice = bundlesTotal + productsTotal;
            
            return {
                ...prev,
                selectedProducts: updatedProducts,
                // Keep old fields for backward compatibility (use first selected if any)
                selectedProductId: updatedProducts.length > 0 ? updatedProducts[0].id : null,
                selectedProduct: updatedProducts.length > 0 ? updatedProducts[0].product : null,
                selectedProductPrice: totalPrice
            };
        });
        // Don't auto-navigate - let user select multiple items
    };

    // Handle material selection for "Build Your Own System"
    const handleMaterialSelect = (material) => {
        setSelectedMaterials(prev => {
            const isSelected = prev.some(m => m.material_id === material.id);
            
            if (isSelected) {
                // Remove material if already selected
                return prev.filter(m => m.material_id !== material.id);
            } else {
                // Add material with quantity 1
                return [...prev, {
                    material_id: material.id,
                    quantity: 1
                }];
            }
        });
    };

    // Update material quantity
    const updateMaterialQuantity = (materialId, newQuantity) => {
        if (newQuantity < 1) {
            // Remove material if quantity is 0 or less
            setSelectedMaterials(prev => prev.filter(m => m.material_id !== materialId));
            return;
        }
        
        setSelectedMaterials(prev => 
            prev.map(m => 
                m.material_id === materialId 
                    ? { ...m, quantity: newQuantity }
                    : m
            )
        );
    };

    // Calculate custom bundle price
    const calculateCustomBundle = async () => {
        console.log("calculateCustomBundle called", { selectedMaterialsCount: selectedMaterials.length });
        
        if (selectedMaterials.length === 0) {
            alert("Please select at least one material to calculate bundle price.");
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                alert("Please login to continue");
                navigate('/login');
                return;
            }

            const response = await axios.post(API.CUSTOM_BUNDLE_CALCULATE, {
                materials: selectedMaterials
            }, {
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.data.status === 'success') {
                const calculation = response.data.data;
                setCustomBundleCalculation(calculation);
                
                // Update form data with calculated price and materials
                setFormData(prev => ({
                    ...prev,
                    selectedProductPrice: Number(calculation.total_price || 0),
                    selectedProducts: calculation.materials?.map(m => ({
                        id: m.material_id,
                        product: { name: m.name, price: m.unit_price },
                        price: m.unit_price,
                        quantity: m.quantity
                    })) || []
                }));
            } else {
                alert("Failed to calculate bundle price. Please try again.");
            }
        } catch (error) {
            console.error("Custom bundle calculation error:", error);
            const errorMessage = error.response?.data?.message || "Failed to calculate bundle price. Please try again.";
            alert(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    // Update bundle quantity
    const updateBundleQuantity = (bundleId, newQuantity) => {
        if (newQuantity < 1) return; // Don't allow quantity less than 1
        
        setFormData(prev => {
            const updatedBundles = prev.selectedBundles.map(b => 
                b.id === bundleId ? { ...b, quantity: newQuantity } : b
            );
            
            // Calculate total price from all selected bundles and products (accounting for quantity)
            const bundlesTotal = updatedBundles.reduce((sum, b) => sum + (b.price * (b.quantity || 1)), 0);
            const productsTotal = prev.selectedProducts.reduce((sum, p) => sum + (p.price * (p.quantity || 1)), 0);
            const totalPrice = bundlesTotal + productsTotal;
            
            return {
                ...prev,
                selectedBundles: updatedBundles,
                selectedProductPrice: totalPrice
            };
        });
    };

    // Update product quantity
    const updateProductQuantity = (productId, newQuantity) => {
        if (newQuantity < 1) return; // Don't allow quantity less than 1
        
        setFormData(prev => {
            const updatedProducts = prev.selectedProducts.map(p => 
                p.id === productId ? { ...p, quantity: newQuantity } : p
            );
            
            // Calculate total price from all selected bundles and products (accounting for quantity)
            const bundlesTotal = prev.selectedBundles.reduce((sum, b) => sum + (b.price * (b.quantity || 1)), 0);
            const productsTotal = updatedProducts.reduce((sum, p) => sum + (p.price * (p.quantity || 1)), 0);
            const totalPrice = bundlesTotal + productsTotal;
            
            return {
                ...prev,
                selectedProducts: updatedProducts,
                selectedProductPrice: totalPrice
            };
        });
    };

    const buyNowContactComplete = () => {
        if (
            !formData.fullName?.trim() ||
            !formData.phone?.trim() ||
            !formData.state?.trim() ||
            !formData.houseNo?.trim() ||
            !formData.streetName?.trim()
        ) {
            return false;
        }
        if (formData.isGatedEstate && (!formData.estateName?.trim() || !formData.estateAddress?.trim())) {
            return false;
        }
        return true;
    };

    const formatBuyNowInstallationAddress = () => {
        const fd = formData;
        const parts = [
            fd.houseNo && fd.streetName ? `${fd.houseNo}, ${fd.streetName}` : fd.streetName || fd.houseNo,
            fd.landmark,
            fd.state,
            fd.isGatedEstate && fd.estateName ? `Estate: ${fd.estateName}` : null,
            fd.isGatedEstate && fd.estateAddress ? fd.estateAddress : null,
        ].filter(Boolean);
        return parts.join(' · ') || fd.address || '';
    };

    const handleCheckoutSubmit = async () => {
        if (!buyNowContactComplete()) {
            alert('Please complete your contact name, phone, state, and installation address (house no. & street) before confirming.');
            return;
        }
        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                alert("Please login to continue");
                navigate('/login');
                return;
            }

            const payload = {
                customer_type: formData.customerType,
                product_category: formData.productCategory,
                installer_choice: formData.installerChoice || 'troosolar',
                include_insurance: formData.includeInsurance || false,
                include_installation_material: !!formData.includeInstallationMaterial,
                property_state: formData.state,
                property_address: formatBuyNowInstallationAddress(),
                contact_name: formData.fullName?.trim() || undefined,
                contact_phone: formData.phone?.trim() || undefined,
                is_gated_estate: !!formData.isGatedEstate,
            };
            const linkedAuditId = cartToken
                ? (auditRequestId || formData.auditRequestId)
                : null;
            if (linkedAuditId) {
                payload.audit_request_id = Number(linkedAuditId);
            }
            if (formData.floors) payload.property_floors = Number(formData.floors) || null;
            if (formData.rooms) payload.property_rooms = Number(formData.rooms) || null;
            if (formData.isGatedEstate) {
                if (formData.estateName?.trim()) payload.estate_name = formData.estateName.trim();
                if (formData.estateAddress?.trim()) payload.estate_address = formData.estateAddress.trim();
            }

            const catalogProductSelections = formData.selectedProducts.filter(isRealCatalogProductSelection);

            // Catalog products (battery, inverter, panels, etc.) — takes priority over build-system materials
            if (catalogProductSelections.length > 0) {
                payload.amount = catalogProductSelections.reduce(
                    (sum, p) => sum + (p.price * (p.quantity || 1)),
                    0
                );
                payload.product_ids = catalogProductSelections.map((p) => Number(p.id));
            }
            // Bundles in cart: always send bundle_id + line total (fixes orders with amount-only and null bundle_id)
            else if (formData.selectedBundles?.length > 0) {
                const primary = formData.selectedBundles[0];
                const bundleDbId = primary?.id ?? primary?.bundle?.id ?? formData.selectedBundleId;
                if (bundleDbId) payload.bundle_id = Number(bundleDbId);
                const bundleTotal = formData.selectedBundles.reduce((sum, b) => sum + (b.price * (b.quantity || 1)), 0);
                if (bundleTotal > 0) payload.amount = bundleTotal;
            } else if (formData.selectedBundleId && formData.optionType === 'choose-system') {
                payload.bundle_id = formData.selectedBundleId;
                const bundleTotal = formData.selectedBundles?.length
                    ? formData.selectedBundles.reduce((sum, b) => sum + (b.price * (b.quantity || 1)), 0)
                    : 0;
                if (bundleTotal > 0) payload.amount = bundleTotal;
                else if (formData.selectedProductPrice > 0) payload.amount = formData.selectedProductPrice;
            }
            // For custom bundles (build-system): send amount and custom_materials
            else if (formData.optionType === 'build-system' && selectedMaterials.length > 0) {
                const materialsTotal = selectedMaterials.reduce((sum, selMat) => {
                    const mat = allMaterialsMap[selMat.material_id] || categoryMaterials.find((m) => m.id === selMat.material_id);
                    const rate = Number(mat?.selling_rate ?? mat?.rate ?? 0);
                    return sum + rate * (selMat.quantity || 1);
                }, 0);
                payload.amount = materialsTotal > 0 ? materialsTotal : formData.selectedProductPrice;
                payload.custom_materials = selectedMaterials.map((m) => ({
                    material_id: m.material_id,
                    quantity: m.quantity || 1,
                }));
            }
            // For individual products (legacy single-id path)
            else if (formData.selectedProductId || formData.selectedProducts.length > 0) {
                if (formData.selectedProducts.length > 0) {
                    payload.amount = formData.selectedProductPrice;
                    payload.product_ids = formData.selectedProducts.map((p) => Number(p.id));
                } else {
                    payload.product_id = formData.selectedProductId;
                    payload.amount = formData.selectedProductPrice;
                }
            } else {
                // Fallback: use amount if no specific selection
                payload.amount = formData.selectedProductPrice || 0;
            }

            // Add optional fields if available
            if (formData.stateId) payload.state_id = formData.stateId;
            if (formData.deliveryLocationId) payload.delivery_location_id = formData.deliveryLocationId;
            if (selectedAddOns.length > 0) payload.add_on_ids = selectedAddOns;
            
            // Always include inspection fee (it's a standard fee for all orders)
            payload.include_inspection = formData.includeInspection !== undefined ? formData.includeInspection : true;

            const response = await axios.post(API.BUY_NOW_CHECKOUT, payload, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                }
            });

            if (response.data.status === 'success') {
                const checkoutData = response.data.data;
                setInvoiceDetails(checkoutData);
                setOrderId(checkoutData.order_id);
                setOrderFetchedLineItems([]);
                setStep(5);
            }
        } catch (error) {
            console.error("Checkout Error:", error);
            const errorMessage = error.response?.data?.message || 
                                (error.response?.data?.errors ? JSON.stringify(error.response.data.errors) : null) ||
                                "Failed to process checkout. Please check all required fields.";
            alert(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const fetchCalendarSlots = async () => {
        const paymentDate = new Date().toISOString().split('T')[0];
        const applyFallback = () => {
            setCalendarSlots(
                generateLocalCalendarSlots({ paymentDate, type: 'installation' })
            );
        };

        setCalendarSlotsLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const response = await axios.get(
                `${API.CALENDAR_SLOTS}?type=installation&payment_date=${paymentDate}`,
                {
                    headers: {
                        Accept: 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                }
            );
            const slots = response?.data?.data?.slots;
            if (response.data?.status === 'success' && Array.isArray(slots) && slots.length > 0) {
                setCalendarSlots(slots);
            } else {
                applyFallback();
            }
        } catch (error) {
            console.error('Calendar Error:', error);
            applyFallback();
        } finally {
            setCalendarSlotsLoading(false);
        }
    };

    const confirmPayment = async (orderId, txId, amount, installationRequestedDate) => {
        const token = localStorage.getItem('access_token');
        if (!token) return false;
        try {
            const payload = {
                amount: String(amount),
                orderId: Number(orderId),
                txId: String(txId || ""),
                type: "direct",
            };
            if (installationRequestedDate) {
                payload.installation_requested_date = installationRequestedDate;
            }
            const { data } = await axios.post(
                API.Payment_Confirmation,
                payload,
                {
                    headers: {
                        Accept: "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                }
            );
            return data?.status === "success";
        } catch (e) {
            console.error("Payment confirmation failed:", e);
            return false;
        }
    };

    const handleProceedToPayment = async () => {
        if (!invoiceDetails || !orderId) {
            alert("Invoice details missing. Please try again.");
            return;
        }

        setProcessingPayment(true);
        try {
            await ensureFlutterwave();

            const { invoiceTotals } = buildBuyNowInvoiceViewModel(invoiceDetails);
            const amount = invoiceTotals.grandTotal;

            if (!amount || amount <= 0) {
                alert("Invalid payment amount. Please refresh and try again.");
                setProcessingPayment(false);
                return;
            }

            const txRef = "buynow_" + Date.now() + "_" + orderId;

            // Get user info from localStorage or API
            const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
            const userEmail = userInfo.email || 'customer@troosolar.com';
            const userName = (formData.fullName?.trim() || userInfo.name || userInfo.full_name || [userInfo.first_name, userInfo.sur_name].filter(Boolean).join(' ') || 'Customer').trim();

            window.FlutterwaveCheckout({
                public_key: FLUTTERWAVE_PUBLIC_KEY,
                tx_ref: txRef,
                amount: amount,
                currency: "NGN",
                payment_options: "card,ussd,banktransfer",
                customer: {
                    email: userEmail,
                    name: userName,
                    phone_number: formData.phone?.trim() || userInfo.phone || '',
                },
                callback: async (response) => {
                    if (response?.status === "successful") {
                        if (typeof window.closePaymentModal === 'function') {
                            window.closePaymentModal();
                        }
                        const slotDate = selectedSlot?.date
                            ? (typeof selectedSlot.date === 'string'
                                ? selectedSlot.date.slice(0, 10)
                                : new Date(selectedSlot.date).toISOString().slice(0, 10))
                            : undefined;
                        const confirmed = await confirmPayment(
                            orderId,
                            response.transaction_id,
                            amount,
                            slotDate
                        );
                        if (confirmed) {
                            setPaymentResult('success');
                            setStep(6); // Go to success step
                        } else {
                            alert("Payment verification failed. Please contact support if amount was debited.");
                            setPaymentResult('failed');
                        }
                    } else {
                        setPaymentResult('failed');
                    }
                    setProcessingPayment(false);
                },
                onclose: () => {
                    setProcessingPayment(false);
                },
            });
        } catch (error) {
            console.error("Payment initialization error:", error);
            alert("Failed to initialize payment. Please try again.");
            setProcessingPayment(false);
        }
    };

    // Fetch configuration data when component mounts or before Step 4
    React.useEffect(() => {
        const fetchConfig = async () => {
            setConfigLoading(true);
            try {
                const [addOnsRes, statesRes, checkoutRes] = await Promise.all([
                    axios.get(API.CONFIG_ADD_ONS, { params: { type: 'buy_now' } }).catch(() => ({ data: { status: 'error' }, status: 404 })),
                    axios.get(API.CONFIG_STATES).catch(() => ({ data: { status: 'error' }, status: 404 })),
                    axios.get(API.CONFIG_CHECKOUT_SETTINGS).catch(() => ({ data: { status: 'error' }, status: 404 })),
                ]);

                // Only set data if API call was successful (not 404)
                if (addOnsRes.status !== 404 && addOnsRes.data?.status === 'success') {
                    setAddOns(addOnsRes.data.data || []);
                }
                if (statesRes.status !== 404 && statesRes.data?.status === 'success') {
                    setStates(statesRes.data.data || []);
                }
                if (checkoutRes.status !== 404 && checkoutRes.data?.status === 'success') {
                    setCheckoutSettings(checkoutRes.data.data || null);
                }
            } catch (error) {
                // Silently fail - APIs may not be implemented yet
                console.log("Configuration APIs not available yet:", error.message);
            } finally {
                setConfigLoading(false);
            }
        };
        fetchConfig();
    }, []);

    // Refresh checkout settings before options/invoice so Admin fee changes (materials, delivery) apply.
    React.useEffect(() => {
        if (![4, 7, 7.5, 5].includes(step)) return;
        let cancelled = false;
        (async () => {
            try {
                const checkoutRes = await axios.get(API.CONFIG_CHECKOUT_SETTINGS);
                if (!cancelled && checkoutRes.data?.status === 'success') {
                    setCheckoutSettings(checkoutRes.data.data || null);
                }
            } catch {
                /* keep previous settings */
            }
        })();
        return () => { cancelled = true; };
    }, [step]);

    // Prefill contact from logged-in user (once)
    React.useEffect(() => {
        try {
            const u = JSON.parse(localStorage.getItem('user_info') || '{}');
            const nameFromProfile = [u.first_name, u.sur_name].filter(Boolean).join(' ').trim();
            setFormData((prev) => {
                if (prev.fullName?.trim() || prev.phone?.trim()) return prev;
                return {
                    ...prev,
                    fullName: nameFromProfile || u.name || u.full_name || '',
                    phone: u.phone || '',
                };
            });
        } catch {
            /* ignore */
        }
    }, []);

    // Fetch delivery locations when state is selected
    React.useEffect(() => {
        if (selectedStateId) {
            const fetchDeliveryLocations = async () => {
                try {
                    const response = await axios.get(API.CONFIG_DELIVERY_LOCATIONS(selectedStateId));
                    if (response.data.status === 'success') {
                        setDeliveryLocations(response.data.data || []);
                    }
                } catch (error) {
                    console.error("Failed to fetch delivery locations:", error);
                }
            };
            fetchDeliveryLocations();
        }
    }, [selectedStateId]);

    useEffect(() => {
        if (step === 7.5 && formData.optionType !== 'audit') {
            fetchCalendarSlots();
        }
    }, [step, formData.optionType]);

    // After checkout, load order line items only when checkout response had no product_line_items.
    useEffect(() => {
        if (step !== 5 || !orderId) return;
        if (Array.isArray(invoiceDetails?.product_line_items) && invoiceDetails.product_line_items.length > 0) {
            return;
        }
        const token = localStorage.getItem('access_token');
        if (!token) return;

        let cancelled = false;
        const loadOrderItems = async () => {
            try {
                const response = await axios.get(`${API.ORDERS}/${orderId}`, {
                    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                });
                const order = response.data?.data ?? response.data;
                const items = order?.items;
                if (!cancelled && Array.isArray(items) && items.length > 0) {
                    setOrderFetchedLineItems(items);
                }
            } catch (err) {
                console.warn('Could not load order items for invoice:', err);
            }
        };
        loadOrderItems();
        return () => { cancelled = true; };
    }, [step, orderId, invoiceDetails?.product_line_items]);

    // Enrich bundle details when entering Order Summary or Invoice
    useEffect(() => {
        if ((step === 7 || step === 7.5) && formData.selectedBundles.length > 0) {
            enrichBundlesForOrderSummary();
        }
    }, [step]);


    // Fetch bundles when step 3.5 is reached (only once)
    // Refresh audit request when on success step (all audit types)
    useEffect(() => {
        if (step === 6 && formData.optionType === 'audit' && auditRequestId) {
            fetchAuditRequests(auditRequestId);
            const interval = setInterval(() => {
                fetchAuditRequests(auditRequestId);
            }, 30000);
            return () => clearInterval(interval);
        }
    }, [step, auditRequestId, formData.optionType]);

    const normalizeBundleType = (value) =>
        String(value || '')
            .toLowerCase()
            .replace(/[+]/g, ' plus ')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();

    const bundleTypeAliasesByCategory = React.useMemo(() => ({
        'full-kit': [
            'solar inverter battery',
            'solar plus inverter plus battery',
            'solar-inverter-battery',
            'full kit',
        ],
        'inverter-battery': [
            'inverter battery',
            'inverter and battery',
            'inverter plus battery',
        ],
        'battery-only': ['battery only', 'battery'],
        'inverter-only': ['inverter only', 'inverters only', 'inverter', 'inverters'],
        'panels-only': ['solar panel only', 'panels only', 'solar panels only', 'panel only'],
    }), []);

    const getBundleCategoryLabel = (bundle) => {
        const raw = bundle?.bundle_type || bundle?.category || bundle?.product_category || bundle?.category_type;
        const normalized = normalizeBundleType(raw);
        for (const [categoryKey, aliases] of Object.entries(bundleTypeAliasesByCategory)) {
            if (aliases.some((alias) => normalized.includes(normalizeBundleType(alias)))) {
                if (categoryKey === 'full-kit') return 'Solar + Inverter + Battery';
                if (categoryKey === 'inverter-battery') return 'Inverter + Battery';
                if (categoryKey === 'battery-only') return 'Battery only';
                if (categoryKey === 'inverter-only') return 'Inverters only';
                if (categoryKey === 'panels-only') return 'Panels only';
            }
        }
        return raw || 'Uncategorized';
    };

    const filterBundlesByCategory = React.useCallback((arr, categoryKey) => {
        if (!Array.isArray(arr)) return [];
        const aliases = bundleTypeAliasesByCategory[categoryKey];
        if (!aliases?.length) return arr;
        const fullKitAliases = bundleTypeAliasesByCategory['full-kit'] || [];
        return arr.filter((bundle) => {
            const normalized = normalizeBundleType(
                bundle?.bundle_type || bundle?.category || bundle?.product_category || bundle?.category_type
            );
            if (categoryKey === 'inverter-battery') {
                const isFullSolarKit = fullKitAliases.some((alias) =>
                    normalized.includes(normalizeBundleType(alias))
                );
                if (isFullSolarKit) return false;
            }
            return aliases.some((alias) => normalized.includes(normalizeBundleType(alias)));
        });
    }, [bundleTypeAliasesByCategory]);

    const parseBundlesApiList = (response) => {
        const root = response?.data?.data ?? response?.data;
        if (Array.isArray(root)) return root;
        if (Array.isArray(root?.data)) return root.data;
        if (root && typeof root === 'object' && root.id) return [root];
        return [];
    };

    const loadBundlesForSelectionStep = React.useCallback(async () => {
        const qParam = searchParams.get('q');
        const hasLoadParam = qParam && !Number.isNaN(Number(qParam));
        const productCategory = formData.productCategory || searchParams.get('category') || 'full-kit';

        if (hasLoadParam) {
            bundlesFetchedRef.current = true;
        }

        setBundlesLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const headers = {
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            };
            let arr = [];

            if (hasLoadParam) {
                const loadW = Math.max(0, Math.round(Number(qParam)));
                const bundleTypeByCategory = {
                    'full-kit': 'Solar+Inverter+Battery',
                    'inverter-battery': 'Inverter + Battery',
                };
                const bundleTypeParam = bundleTypeByCategory[productCategory];
                const queryParams = new URLSearchParams({ q: String(loadW) });
                const kvaParam = searchParams.get('kva');
                if (kvaParam) {
                    queryParams.set('kva', String(kvaParam));
                }
                if (bundleTypeParam) {
                    queryParams.set('bundle_type', bundleTypeParam);
                }
                const response = await axios.get(`${API.BUNDLES}?${queryParams.toString()}`, { headers });
                arr = parseBundlesApiList(response);
            } else {
                const bundleTypeMap = {
                    'full-kit': 'solar-inverter-battery',
                    'inverter-battery': 'inverter-battery',
                };
                const bundleType = bundleTypeMap[productCategory] || 'inverter-battery';
                try {
                    const response = await axios.get(API.BUNDLES_BY_TYPE(bundleType), { headers });
                    arr = parseBundlesApiList(response);
                } catch (error) {
                    console.error('Failed to fetch bundles by type:', error);
                    const fallbackResponse = await axios.get(API.BUNDLES, { headers });
                    arr = parseBundlesApiList(fallbackResponse);
                }
            }

            const filtered = filterBundlesByCategory(arr, productCategory);
            bundlesSnapshotRef.current = filtered;
            setBundles(filtered);
        } catch (error) {
            console.error('Failed to fetch bundles for selection step:', error);
            setBundles([]);
        } finally {
            setBundlesLoading(false);
            bundlesNeedRefreshRef.current = false;
        }
    }, [searchParams, formData.productCategory, filterBundlesByCategory]);

    const activeSolutionCategory = formData.productCategory || searchParams.get('category') || 'full-kit';
    const isInverterFlow = activeSolutionCategory === 'inverter-battery';
    const solutionLabel = isInverterFlow ? 'Choose My Inverter Solution' : 'Choose My Solar Bundle';
    const solutionListLabel = isInverterFlow ? 'inverter solutions' : 'solar bundles';

    useEffect(() => {
        if (step !== 3.5) {
            bundlesFetchedRef.current = false;
            return;
        }

        const effectiveOption = formData.optionType || 'choose-system';
        if (effectiveOption !== 'choose-system') {
            return;
        }

        if (bundles.length === 0 && bundlesSnapshotRef.current.length > 0) {
            setBundles(bundlesSnapshotRef.current);
            return;
        }

        if (bundlesLoading) {
            return;
        }

        const qParam = searchParams.get('q');
        const hasLoadParam = qParam && !Number.isNaN(Number(qParam));
        const needsFetch = bundles.length === 0 || bundlesNeedRefreshRef.current;
        if (!needsFetch) {
            return;
        }
        if (hasLoadParam && bundlesFetchedRef.current && !bundlesNeedRefreshRef.current) {
            return;
        }

        loadBundlesForSelectionStep();
    }, [
        step,
        formData.optionType,
        formData.productCategory,
        bundles.length,
        bundlesLoading,
        searchParams,
        loadBundlesForSelectionStep,
    ]);

    // --- Render Steps ---

    const renderStep1 = () => (
        <div className="animate-fade-in">
            {/* Buy Now Badge */}
            <div className="flex justify-center mb-6">
                <span className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-bold bg-gradient-to-r from-[#E8A91D] to-[#d4991a] text-white shadow-lg">
                    <CreditCard size={16} className="mr-2" />
                    Buy Now
                </span>
            </div>
            <h2 className="text-3xl font-bold text-center mb-10 text-[#273e8e]">
            What are you purchasing for?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                <button onClick={() => handleCustomerTypeSelect('residential')} className="group bg-white border-2 border-gray-200 hover:border-[#273e8e] rounded-2xl p-8 hover:shadow-2xl transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden transform hover:-translate-y-1">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#273e8e] to-[#E8A91D]"></div>
                    <div className="bg-gradient-to-br from-[#273e8e]/10 to-[#E8A91D]/10 p-6 rounded-full mb-6 group-hover:from-[#273e8e]/20 group-hover:to-[#E8A91D]/20 transition-all duration-300">
                        <Home size={40} className="text-[#273e8e] group-hover:scale-110 transition-transform" />
                    </div>
                    <h3 className="text-xl font-bold mb-2 text-gray-800 group-hover:text-[#273e8e] transition-colors">For Residential</h3>
                </button>
                <button onClick={() => handleCustomerTypeSelect('sme')} className="group bg-white border-2 border-gray-200 hover:border-[#273e8e] rounded-2xl p-8 hover:shadow-2xl transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden transform hover:-translate-y-1">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#273e8e] to-[#E8A91D]"></div>
                    <div className="bg-gradient-to-br from-[#273e8e]/10 to-[#E8A91D]/10 p-6 rounded-full mb-6 group-hover:from-[#273e8e]/20 group-hover:to-[#E8A91D]/20 transition-all duration-300">
                        <Building2 size={40} className="text-[#273e8e] group-hover:scale-110 transition-transform" />
                    </div>
                    <h3 className="text-xl font-bold mb-2 text-gray-800 group-hover:text-[#273e8e] transition-colors">For SMEs</h3>
                </button>
                <button onClick={() => handleCustomerTypeSelect('commercial')} className="group bg-white border-2 border-gray-200 hover:border-[#273e8e] rounded-2xl p-8 hover:shadow-2xl transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden transform hover:-translate-y-1">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#273e8e] to-[#E8A91D]"></div>
                    <div className="bg-gradient-to-br from-[#273e8e]/10 to-[#E8A91D]/10 p-6 rounded-full mb-6 group-hover:from-[#273e8e]/20 group-hover:to-[#E8A91D]/20 transition-all duration-300">
                        <Factory size={40} className="text-[#273e8e] group-hover:scale-110 transition-transform" />
                    </div>
                    <h3 className="text-xl font-bold mb-2 text-gray-800 group-hover:text-[#273e8e] transition-colors">Commercial & Industrial</h3>
                </button>
            </div>
        </div>
    );

    // NEW: Render Step 2 - Solar Solution Selection (5 predefined options, same as BNPL)
    const renderStep2 = () => {
        return (
            <>
                <button type="button" onClick={() => navigate('/')} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e] transition-colors">
                    <ArrowLeft size={16} className="mr-2" /> Back
                </button>
                <div className="flex justify-center mb-6">
                    <span className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-bold bg-gradient-to-r from-[#E8A91D] to-[#d4991a] text-white shadow-lg">
                        <CreditCard size={16} className="mr-2" />
                        Buy Now
                    </span>
                </div>
                <h2 className="text-3xl font-bold text-center mb-10 text-[#273e8e]">Select Product Category</h2>
                {categories.length === 0 ? (
                    <div className="text-center py-12">
                        <Loader className="animate-spin mx-auto text-[#273e8e]" size={48} />
                        <p className="mt-4 text-gray-600">Loading categories...</p>
                    </div>
                ) : (
                    <ProductCategoryGrid onSelect={handleCategorySelect} />
                )}
            </>
        );
    };

    // OLD: Render Step 2 - API Category Selection (COMMENTED OUT - Used for "Build my solar system" path now as Step 2.75)
    // const renderStep2 = () => {
    //     // Helper to get category icon based on category name
    //     const getCategoryIcon = (categoryName) => {
    //         const name = (categoryName || '').toLowerCase();
    //         if (name.includes('battery')) return Battery;
    //         if (name.includes('inverter')) return Monitor;
    //         if (name.includes('solar') || name.includes('panel')) return Sun;
    //         return Zap; // Default icon
    //     };

    //     return (
    //         <div className="animate-fade-in">
    //             <button onClick={() => setStep(1)} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
    //                 <ArrowLeft size={16} className="mr-2" /> Back
    //             </button>
    //             <h2 className="text-3xl font-bold text-center mb-8 text-[#273e8e]">
    //                 Select Product Category
    //             </h2>
    //             {categories.length === 0 ? (
    //                 <div className="text-center py-12">
    //                     <Loader className="animate-spin mx-auto text-[#273e8e]" size={48} />
    //                     <p className="mt-4 text-gray-600">Loading categories...</p>
    //                 </div>
    //             ) : (
    //                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
    //                     {categories.map((cat) => {
    //                         const IconComponent = getCategoryIcon(cat.title || cat.name);
    //                         const categoryName = cat.title || cat.name || `Category #${cat.id}`;
    //                         const categoryIcon = cat.icon ? toAbsolute(cat.icon) : null;
    //                         
    //                         return (
    //                             <button
    //                                 key={cat.id}
    //                                 onClick={() => handleCategorySelect(cat.id)}
    //                                 className="group bg-white border-2 border-gray-100 hover:border-[#273e8e] rounded-2xl p-6 hover:shadow-xl transition-all duration-300 flex flex-col items-center text-center"
    //                             >
    //                                 <div className="bg-blue-50 p-4 rounded-full mb-4 group-hover:bg-[#273e8e]/10 transition-colors flex items-center justify-center min-h-[64px] relative">
    //                                     <IconComponent size={32} className="text-[#273e8e]" />
    //                                     {categoryIcon && (
    //                                         <img 
    //                                             src={categoryIcon} 
    //                                             alt={categoryName}
    //                                             className="w-8 h-8 object-contain absolute"
    //                                             onError={(e) => {
    //                                                 e.target.style.display = 'none';
    //                                             }}
    //                                         />
    //                                     )}
    //                                 </div>
    //                                 <h3 className="text-lg font-bold text-gray-800">{categoryName}</h3>
    //                             </button>
    //                         );
    //                     })}
    //                 </div>
    //             )}
    //         </div>
    //     );
    // };

    // NEW: Render Step 2.75 - API Category Selection (for "Build my solar system" path)
    const renderStep2_75 = () => {
        // Helper to get category icon based on category name
        const getCategoryIcon = (categoryName) => {
            const name = (categoryName || '').toLowerCase();
            if (name.includes('battery')) return Battery;
            if (name.includes('inverter')) return Monitor;
            if (name.includes('solar') || name.includes('panel')) return Sun;
            return Zap; // Default icon
        };

        // For build-system, show material categories; otherwise show product categories
        const isBuildSystem = formData.optionType === 'build-system';
        const categoriesToShow = isBuildSystem ? materialCategories : categories;
        const isLoading = isBuildSystem ? materialsLoading : false;

        return (
            <div className="animate-fade-in">
                <button 
                    onClick={() => {
                        if (isBuildSystem) {
                            setStep(3); // Go back to method selection
                        } else {
                            setStep(2); // Go back to product category selection
                        }
                    }} 
                    className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]"
                >
                    <ArrowLeft size={16} className="mr-2" /> Back
                </button>
                <h2 className="text-3xl font-bold text-center mb-8 text-[#273e8e]">
                    {isBuildSystem ? 'Select Material Category' : 'Select Product Category'}
                </h2>
                {isLoading ? (
                    <div className="text-center py-12">
                        <Loader className="animate-spin mx-auto text-[#273e8e]" size={48} />
                        <p className="mt-4 text-gray-600">Loading categories...</p>
                    </div>
                ) : categoriesToShow.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-600">No categories available.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
                        {categoriesToShow.map((cat) => {
                            const IconComponent = getCategoryIcon(cat.name || cat.title);
                            const categoryName = cat.name || cat.title || `Category #${cat.id}`;
                            const categoryIcon = cat.icon ? toAbsolute(cat.icon) : null;
                            
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => {
                                        if (isBuildSystem) {
                                            handleMaterialCategorySelect(cat.id);
                                        } else {
                                            handleBuildSystemCategorySelect(cat.id);
                                        }
                                    }}
                                    className="group bg-white border-2 border-gray-100 hover:border-[#273e8e] rounded-2xl p-6 hover:shadow-xl transition-all duration-300 flex flex-col items-center text-center"
                                >
                                    <div className="bg-blue-50 p-4 rounded-full mb-4 group-hover:bg-[#273e8e]/10 transition-colors flex items-center justify-center min-h-[64px] relative">
                                        <IconComponent size={32} className="text-[#273e8e]" />
                                        {categoryIcon && (
                                            <img 
                                                src={categoryIcon} 
                                                alt={categoryName}
                                                className="w-8 h-8 object-contain absolute"
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                }}
                                            />
                                        )}
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-800">{categoryName}</h3>
                                    {cat.code && (
                                        <p className="text-xs text-gray-500 mt-1">Code: {cat.code}</p>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    const renderStep2_5 = () => {

        const getProductImage = (product) => {
            if (product.featured_image_url) {
                return toAbsolute(product.featured_image_url);
            }
            if (product.featured_image) {
                return toAbsolute(product.featured_image);
            }
            if (product.images && product.images[0] && product.images[0].image) {
                return toAbsolute(product.images[0].image);
            }
            // Return fallback image
            return FALLBACK_IMAGE;
        };

        const productGridStart = (productGridPage - 1) * BUNDLE_STEP_GRID_PAGE_SIZE;
        const paginatedProducts = orderedCategoryProducts.slice(
            productGridStart,
            productGridStart + BUNDLE_STEP_GRID_PAGE_SIZE
        );

        return (
            <div className="animate-fade-in">
                <button 
                    onClick={() => {
                        // Clear products when going back
                        setCategoryProducts([]);
                        setProductsLoading(false);
                        setProductGridPage(1);
                        setStep(2);
                    }} 
                    className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]"
                >
                    <ArrowLeft size={16} className="mr-2" /> Back
                </button>
                <h2 className="text-3xl font-bold text-center mb-4 text-[#273e8e]">
                    Select Product
                </h2>
                <p className="text-center text-gray-600 mb-8">
                    Choose from available products in this category
                </p>

                {productsLoading ? (
                    <div className="text-center py-16">
                        <div className="flex flex-col items-center justify-center">
                            <Loader className="animate-spin mx-auto text-[#273e8e]" size={48} />
                            <p className="mt-6 text-lg font-medium text-gray-700">Loading products...</p>
                            <p className="mt-2 text-sm text-gray-500">Please wait while we fetch available products</p>
                        </div>
                    </div>
                ) : orderedCategoryProducts.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                        <p className="text-gray-600">No products available in this category.</p>
                        <button
                            onClick={() => setStep(2)}
                            className="mt-4 text-[#273e8e] hover:underline"
                        >
                            Go back to categories
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                            {paginatedProducts.map((product) => {
                                const price = Number(product.discount_price || product.price || 0);
                                const oldPrice = product.discount_price && product.price && product.discount_price < product.price 
                                    ? Number(product.price) 
                                    : null;
                                const discount = oldPrice && price < oldPrice
                                    ? Math.round(((oldPrice - price) / oldPrice) * 100)
                                    : 0;
                                // Check if product is selected
                                const isSelected = formData.selectedProducts.some(p => p.id === product.id);
                                const isRec = entityHighlyRecommended(product);
                                const isHot = entityTopDeal(product);
                                const isPromoHighlight = isRec || isHot;
                                
                                return (
                                    <div
                                        key={product.id}
                                        className={`group bg-white border-2 rounded-2xl p-6 hover:shadow-xl transition-all duration-300 cursor-pointer ${
                                            isSelected 
                                                ? 'border-[#273e8e] bg-blue-50 ring-2 ring-[#273e8e]' 
                                                : isPromoHighlight
                                                ? 'border-green-400 ring-2 ring-green-500 shadow-md hover:border-green-600'
                                                : 'border-gray-100 hover:border-[#273e8e]'
                                        }`}
                                        onClick={() => {
                                            // Navigate to product details page
                                            if (product.id) {
                                                navigate(`/homePage/product/${product.id}`);
                                            }
                                        }}
                                    >
                                        <div className="mb-3">
                                            <div className="aspect-square w-full mb-4 rounded-lg overflow-hidden bg-gray-100 relative">
                                                <img
                                                    src={getProductImage(product)}
                                                    alt={product.title || product.name}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                    onError={(e) => {
                                                        // Prevent infinite loop - only set fallback if not already set
                                                        if (e.target.src && !e.target.src.includes(FALLBACK_IMAGE)) {
                                                            e.target.src = FALLBACK_IMAGE;
                                                        }
                                                    }}
                                                />
                                                <div className="absolute top-2 left-2 z-[5] pointer-events-none">
                                                    <ProductPromoBadges
                                                        isRecommended={isRec}
                                                        isHotDeal={isHot}
                                                    />
                                                </div>
                                                {isSelected && (
                                                    <div className="absolute top-2 right-2 bg-[#273e8e] text-white rounded-full p-2">
                                                        <CheckCircle size={20} />
                                                    </div>
                                                )}
                                            </div>
                                            <h3 className="font-bold text-lg mb-2 text-gray-800">
                                                {product.title || product.name || `Product #${product.id}`}
                                            </h3>
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <p className="font-bold text-[#273e8e] text-lg">
                                                        {formatPrice(price)}
                                                    </p>
                                                    {oldPrice && (
                                                        <p className="text-sm text-gray-500 line-through">
                                                            {formatPrice(oldPrice)}
                                                        </p>
                                                    )}
                                                </div>
                                                {discount > 0 && (
                                                    <span className="px-2 py-1 rounded-full text-xs font-bold bg-[#FFA500] text-white">
                                                        -{discount}%
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleProductSelect(product);
                                            }}
                                            className={`w-full py-2 rounded-lg font-semibold transition-colors mt-2 ${
                                                isSelected
                                                    ? 'bg-red-600 text-white hover:bg-red-700'
                                                    : 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
                                            }`}
                                        >
                                            {isSelected ? 'Remove from Selection' : 'Add to Selection'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <GridPagination
                            currentPage={productGridPage}
                            totalItems={orderedCategoryProducts.length}
                            pageSize={BUNDLE_STEP_GRID_PAGE_SIZE}
                            onPageChange={setProductGridPage}
                            itemLabel="products"
                        />
                        
                        {/* Continue Button - Show when at least one product is selected */}
                        {formData.selectedProducts.length > 0 && (
                            <div className="mt-8 flex justify-center">
                                <button
                                    onClick={() => setStep(4)}
                                    className="bg-[#273e8e] text-white px-8 py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors flex items-center"
                                >
                                    Proceed to Checkout Options
                                    <ArrowRight size={20} className="ml-2" />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    };

    const renderStep3_75 = () => {
        const isBuildSystem = formData.optionType === 'build-system';
        const itemsToShow = isBuildSystem ? orderedCategoryMaterials : orderedCategoryProducts;
        const isLoading = isBuildSystem ? materialsLoading : productsLoading;

        const getItemImage = (item) => {
            if (item.featured_image_url) return toAbsolute(item.featured_image_url);
            if (item.featured_image) return toAbsolute(item.featured_image);
            if (item.images && item.images[0] && item.images[0].image) return toAbsolute(item.images[0].image);
            return FALLBACK_IMAGE;
        };

        return (
            <div className="animate-fade-in">
                <button 
                    onClick={() => {
                        if (isBuildSystem) {
                            setCategoryMaterials([]);
                            setMaterialsLoading(false);
                            // Don't clear selectedMaterials - keep selections when going back
                            setStep(2.75);
                        } else {
                            setCategoryProducts([]);
                            setProductsLoading(false);
                            setStep(3);
                        }
                    }} 
                    className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]"
                >
                    <ArrowLeft size={16} className="mr-2" /> Back
                </button>
                <h2 className="text-3xl font-bold text-center mb-4 text-[#273e8e]">
                    {isBuildSystem ? 'Select Materials' : 'Build My System'}
                </h2>
                <p className="text-center text-gray-600 mb-2">
                    {isBuildSystem 
                        ? 'Select materials and quantities to build your custom bundle'
                        : 'Select multiple products to create your custom bundle'}
                </p>
                <p className="text-center text-sm text-orange-600 mb-8 font-semibold">
                    * You must select at least one {isBuildSystem ? 'material' : 'product'} to continue
                </p>

                {isLoading ? (
                    <div className="text-center py-16">
                        <div className="flex flex-col items-center justify-center">
                            <Loader className="animate-spin mx-auto text-[#273e8e]" size={48} />
                            <p className="mt-6 text-lg font-medium text-gray-700">Loading {isBuildSystem ? 'materials' : 'products'}...</p>
                            <p className="mt-2 text-sm text-gray-500">Please wait while we fetch available {isBuildSystem ? 'materials' : 'products'}</p>
                        </div>
                    </div>
                ) : itemsToShow.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                        <p className="text-gray-600">No {isBuildSystem ? 'materials' : 'products'} available at the moment.</p>
                        <button
                            onClick={() => setStep(isBuildSystem ? 2.75 : 3)}
                            className="mt-4 text-[#273e8e] hover:underline"
                        >
                            Go back
                        </button>
                    </div>
                ) : (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                        {itemsToShow.map((item) => {
                            const rawPrice = Number(item.selling_rate || item.rate || item.discount_price || item.price || 0);
                            // If price is 0, show 1000, otherwise show the actual price
                            const price = rawPrice === 0 ? 1000 : rawPrice;
                            const oldPrice = item.rate && item.selling_rate && item.selling_rate > item.rate
                                ? Number(item.rate)
                                : null;
                            const discount = oldPrice && price < oldPrice
                                ? Math.round(((oldPrice - price) / oldPrice) * 100)
                                : 0;
                            
                            // Check if item is selected
                            const isSelected = isBuildSystem 
                                ? selectedMaterials.some(m => m.material_id === item.id)
                                : formData.selectedProducts.some(p => p.id === item.id);
                            
                            // Get quantity for selected material
                            const selectedMaterial = isBuildSystem && isSelected
                                ? selectedMaterials.find(m => m.material_id === item.id)
                                : null;
                            const quantity = selectedMaterial?.quantity || 1;
                            const isRec = entityHighlyRecommended(item);
                            const isHot = entityTopDeal(item);
                            const isPromoHighlight = isRec || isHot;
                            
                            return (
                                <div
                                    key={item.id}
                                    className={`group bg-white border-2 rounded-2xl p-6 hover:shadow-xl transition-all duration-300 cursor-pointer ${
                                        isSelected 
                                            ? 'border-[#273e8e] bg-blue-50 ring-2 ring-[#273e8e]' 
                                            : isPromoHighlight
                                            ? 'border-green-400 ring-2 ring-green-500 shadow-md hover:border-green-600'
                                            : 'border-gray-100 hover:border-[#273e8e]'
                                    }`}
                                    onClick={() => {
                                        // Navigate to product details page if item has an ID
                                        if (item.id && !isBuildSystem) {
                                            navigate(`/homePage/product/${item.id}`);
                                        }
                                    }}
                                >
                                    <div className="mb-3">
                                        <div className="aspect-square w-full mb-4 rounded-lg overflow-hidden bg-gray-100 relative">
                                            <img
                                                src={getItemImage(item)}
                                                alt={item.name || item.title || `Item #${item.id}`}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                onError={(e) => {
                                                    // Prevent infinite loop - only set fallback if not already set
                                                    if (e.target.src && !e.target.src.includes(FALLBACK_IMAGE)) {
                                                        e.target.src = FALLBACK_IMAGE;
                                                    }
                                                }}
                                            />
                                            <div className="absolute top-2 left-2 z-[5] pointer-events-none">
                                                <ProductPromoBadges
                                                    isRecommended={isRec}
                                                    isHotDeal={isHot}
                                                />
                                            </div>
                                            {isSelected && (
                                                <div className="absolute top-2 right-2 bg-[#273e8e] text-white rounded-full p-2">
                                                    <CheckCircle size={20} />
                                                </div>
                                            )}
                                        </div>
                                        <h3 className="font-bold text-lg mb-2 text-gray-800">
                                            {item.name || item.title || `Item #${item.id}`}
                                        </h3>
                                        {item.category && (
                                            <p className="text-xs text-gray-500 mb-2">
                                                {item.category.name || item.category}
                                            </p>
                                        )}
                                        {item.unit && (
                                            <p className="text-xs text-gray-400 mb-2">Unit: {item.unit}</p>
                                        )}
                                        {item.warranty && (
                                            <p className="text-xs text-blue-600 mb-2">Warranty: {item.warranty} years</p>
                                        )}
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <p className="font-bold text-[#273e8e] text-lg">
                                                    {formatPrice(price)} {item.unit ? `/${item.unit}` : ''}
                                                </p>
                                                {oldPrice && (
                                                    <p className="text-sm text-gray-500 line-through">
                                                        {formatPrice(oldPrice)}
                                                    </p>
                                                )}
                                            </div>
                                            {discount > 0 && (
                                                <span className="px-2 py-1 rounded-full text-xs font-bold bg-[#FFA500] text-white">
                                                    -{discount}%
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* Quantity selector for materials */}
                                        {isBuildSystem && isSelected && (
                                            <div className="flex items-center justify-center gap-3 mb-3 bg-gray-50 rounded-lg p-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateMaterialQuantity(item.id, quantity - 1);
                                                    }}
                                                    className="bg-[#273e8e] text-white rounded p-1.5 hover:bg-[#1a2b6b]"
                                                >
                                                    <Minus size={16} />
                                                </button>
                                                <span className="font-semibold text-gray-800 w-8 text-center">{quantity}</span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateMaterialQuantity(item.id, quantity + 1);
                                                    }}
                                                    className="bg-[#273e8e] text-white rounded p-1.5 hover:bg-[#1a2b6b]"
                                                >
                                                    <Plus size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (isBuildSystem) {
                                                handleMaterialSelect(item);
                                            } else {
                                                handleProductSelect(item);
                                            }
                                        }}
                                        className={`w-full py-2 rounded-lg font-semibold transition-colors mt-2 ${
                                            isSelected
                                                ? 'bg-red-600 text-white hover:bg-red-700'
                                                : 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
                                        }`}
                                    >
                                        {isSelected 
                                            ? `Remove ${isBuildSystem ? 'Material' : 'from Bundle'}` 
                                            : `Add ${isBuildSystem ? 'Material' : 'to Bundle'}`}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    
                    {/* Action buttons */}
                    {isBuildSystem ? (
                        <>
                            {/* Selected materials summary */}
                            {selectedMaterials.length > 0 && (
                                <div className="mt-8 bg-blue-50 border-2 border-[#273e8e] rounded-xl p-6 max-w-2xl mx-auto">
                                    <h3 className="font-bold text-lg mb-4 text-gray-800">Selected Materials ({selectedMaterials.length})</h3>
                                    <div className="space-y-2 mb-4">
                                        {selectedMaterials.map((selMat) => {
                                            // Use allMaterialsMap to find material even if not in current category
                                            const material = allMaterialsMap[selMat.material_id] || categoryMaterials.find(m => m.id === selMat.material_id);
                                            if (!material) return null;
                                            const rawPrice = Number(material.selling_rate || material.rate || 0);
                                            const displayPrice = rawPrice === 0 ? 1000 : rawPrice;
                                            const totalPrice = displayPrice * selMat.quantity;
                                            return (
                                                <div key={selMat.material_id} className="flex justify-between items-center p-2 bg-white rounded">
                                                    <span className="text-sm">{material.name || `Material #${selMat.material_id}`} x {selMat.quantity}</span>
                                                    <span className="font-semibold text-[#273e8e]">
                                                        {formatPrice(totalPrice)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            calculateCustomBundle();
                                        }}
                                        disabled={loading}
                                        className="w-full bg-[#273e8e] text-white py-3 rounded-lg font-semibold hover:bg-[#1a2b6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {loading ? (
                                            <>
                                                <Loader className="animate-spin" size={20} />
                                                Calculating...
                                            </>
                                        ) : (
                                            <>
                                                Calculate Bundle Price
                                                <ArrowRight size={20} />
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                            
                            {/* Show calculated bundle price */}
                            {customBundleCalculation && (
                                <div className="mt-6 bg-green-50 border-2 border-green-400 rounded-xl p-6 max-w-2xl mx-auto">
                                    <h3 className="font-bold text-lg mb-2 text-gray-800">Bundle Calculation</h3>
                                    <p className="text-2xl font-bold text-[#273e8e] mb-4">
                                        Total: {formatPrice(Number(customBundleCalculation.total_price || 0))}
                                    </p>
                                    <p className="text-sm text-gray-600 mb-4">
                                        {customBundleCalculation.materials_count || 0} materials included
                                    </p>
                                    <button
                                        onClick={() => setStep(4)}
                                        className="w-full bg-[#273e8e] text-white py-3 rounded-lg font-semibold hover:bg-[#1a2b6b] transition-colors"
                                    >
                                        Proceed to Checkout Options
                                        <ArrowRight size={20} className="inline ml-2" />
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        /* Continue Button for old product flow */
                        formData.selectedProducts.length > 0 && (
                            <div className="mt-8 flex justify-center">
                                <button
                                    onClick={() => setStep(7)}
                                    className="bg-[#273e8e] text-white px-8 py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors flex items-center"
                                >
                                    Continue with {formData.selectedProducts.length} Product{formData.selectedProducts.length !== 1 ? 's' : ''} in Bundle
                                    <ArrowRight size={20} className="ml-2" />
                                </button>
                            </div>
                        )
                    )}
                    </>
                )}
            </div>
        );
    };

    // NEW: Render Step 3 - Action Selection (3 options, same as BNPL)
    const renderStep3 = () => (
        <div className="animate-fade-in">
            <button onClick={() => setStep(2)} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e] transition-colors">
                <ArrowLeft size={16} className="mr-2" /> Back
            </button>
            {/* Buy Now Badge */}
            <div className="flex justify-center mb-6">
                <span className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-bold bg-gradient-to-r from-[#E8A91D] to-[#d4991a] text-white shadow-lg">
                    <CreditCard size={16} className="mr-2" />
                    Buy Now
                </span>
            </div>
            <h2 className="text-3xl font-bold text-center mb-10 text-[#273e8e]">
                How would you like to proceed?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                <button onClick={() => handleOptionSelect('choose-system')} className="group bg-white border-2 border-gray-200 hover:border-[#273e8e] rounded-2xl p-8 hover:shadow-2xl transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden transform hover:-translate-y-1">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#273e8e] to-[#E8A91D]"></div>
                    <div className="bg-gradient-to-br from-[#273e8e]/10 to-[#E8A91D]/10 p-6 rounded-full mb-6 group-hover:from-[#273e8e]/20 group-hover:to-[#E8A91D]/20 transition-all duration-300">
                        <Zap size={40} className="text-[#273e8e] group-hover:scale-110 transition-transform" />
                    </div>
                    <h3 className="text-xl font-bold mb-2 text-gray-800 group-hover:text-[#273e8e] transition-colors">{solutionLabel}</h3>
                </button>
                <button onClick={() => navigate(`/tools?inverter=true&returnTo=buy-now&source=flow&previousStep=3&category=${encodeURIComponent(formData.productCategory || 'full-kit')}`)} className="group bg-white border-2 border-gray-200 hover:border-[#273e8e] rounded-2xl p-8 hover:shadow-2xl transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden transform hover:-translate-y-1">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#273e8e] to-[#E8A91D]"></div>
                    <div className="bg-gradient-to-br from-[#273e8e]/10 to-[#E8A91D]/10 p-6 rounded-full mb-6 group-hover:from-[#273e8e]/20 group-hover:to-[#E8A91D]/20 transition-all duration-300">
                        <Wrench size={40} className="text-[#273e8e] group-hover:scale-110 transition-transform" />
                    </div>
                    <h3 className="text-xl font-bold mb-2 text-gray-800 group-hover:text-[#273e8e] transition-colors">Build My System</h3>
                </button>
                <button onClick={() => handleOptionSelect('audit')} className="group bg-white border-2 border-gray-200 hover:border-[#273e8e] rounded-2xl p-8 hover:shadow-2xl transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden transform hover:-translate-y-1">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#273e8e] to-[#E8A91D]"></div>
                    <div className="bg-gradient-to-br from-[#273e8e]/10 to-[#E8A91D]/10 p-6 rounded-full mb-6 group-hover:from-[#273e8e]/20 group-hover:to-[#E8A91D]/20 transition-all duration-300">
                        <FileText size={40} className="text-[#273e8e] group-hover:scale-110 transition-transform" />
                    </div>
                    <h3 className="text-xl font-bold mb-2 text-gray-800 group-hover:text-[#273e8e] transition-colors">Request Professional Load Audit (paid)</h3>
                </button>
            </div>
        </div>
    );

    // OLD: Render Step 3 - Action Selection (COMMENTED OUT - Now using new Step 3 above)
    // const renderStep3 = () => (
    //     <div className="animate-fade-in">
    //         <button onClick={() => setStep(2)} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
    //             <ArrowLeft size={16} className="mr-2" /> Back
    //         </button>
    //         <h2 className="text-3xl font-bold text-center mb-8 text-[#273e8e]">
    //             How would you like to proceed?
    //         </h2>
    //         <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
    //             <button onClick={() => handleOptionSelect('choose-system')} className="group bg-white border-2 border-gray-100 hover:border-[#273e8e] rounded-2xl p-8 hover:shadow-xl transition-all duration-300 flex flex-col items-center text-center">
    //                 <div className="bg-yellow-50 p-6 rounded-full mb-6 group-hover:bg-[#273e8e]/10 transition-colors">
    //                     <Zap size={40} className="text-yellow-600" />
    //                 </div>
    //                 <h3 className="text-xl font-bold mb-2 text-gray-800">Choose my solar system</h3>
    //             </button>
    //             <button onClick={() => handleOptionSelect('build-system')} className="group bg-white border-2 border-gray-100 hover:border-[#273e8e] rounded-2xl p-8 hover:shadow-xl transition-all duration-300 flex flex-col items-center text-center">
    //                 <div className="bg-purple-50 p-6 rounded-full mb-6 group-hover:bg-[#273e8e]/10 transition-colors">
    //                     <Wrench size={40} className="text-purple-600" />
    //                 </div>
    //                 <h3 className="text-xl font-bold mb-2 text-gray-800">Build My System</h3>
    //             </button>
    //             <button onClick={() => handleOptionSelect('audit')} className="group bg-white border-2 border-gray-100 hover:border-[#273e8e] rounded-2xl p-8 hover:shadow-xl transition-all duration-300 flex flex-col items-center text-center">
    //                 <div className="bg-green-50 p-6 rounded-full mb-6 group-hover:bg-[#273e8e]/10 transition-colors">
    //                     <FileText size={40} className="text-green-600" />
    //                 </div>
    //                 <h3 className="text-xl font-bold mb-2 text-gray-800">Request Professional Audit</h3>
    //             </button>
    //         </div>
    //     </div>
    // );

    const renderStep3_5 = () => {
        const selectedSizeLabel = sizeOptions.find((o) => o.value === selectedSystemSize)?.label || "All Sizes";
        const totalBundlePages = Math.max(1, Math.ceil(filteredBundles.length / BUNDLE_STEP_GRID_PAGE_SIZE));
        const bundleGridStart = (bundleGridPage - 1) * BUNDLE_STEP_GRID_PAGE_SIZE;
        const paginatedBundles = filteredBundles.slice(bundleGridStart, bundleGridStart + BUNDLE_STEP_GRID_PAGE_SIZE);
        const handleBundlePageChange = (page) => {
            if (page < 1 || page > totalBundlePages) return;
            setBundleGridPage(page);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        return (
            <div className="animate-fade-in">
                <button onClick={() => {
                    bundlesFetchedRef.current = false;
                    if (searchParams.get('fromCalculator') === 'true' || searchParams.get('q')) {
                        const q = searchParams.get('q') || '';
                        const qParam = q ? `&q=${encodeURIComponent(q)}` : '';
                        navigate(
                            `/tools?inverter=true&returnTo=buy-now&source=flow&previousStep=3&category=${encodeURIComponent(formData.productCategory || 'full-kit')}${qParam}`
                        );
                        return;
                    }
                    setStep(3);
                }} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
                    <ArrowLeft size={16} className="mr-2" /> Back
                </button>
                <h2 className="text-3xl font-bold text-center mb-4 text-[#273e8e]">
                {solutionLabel}
                </h2>
                <p className="text-center text-gray-600 mb-2">
                    {(() => {
                        const originalLoad = searchParams.get('load') || searchParams.get('q');
                        return originalLoad
                            ? `${isInverterFlow ? 'Solutions' : 'Bundles'} matching your load (${originalLoad} W)`
                            : `Select from our pre-configured ${solutionListLabel}`;
                    })()}
                </p>
                {searchParams.get('q') && (
                    <p className="text-center mb-8">
                        <a
                            href={`/tools?inverter=true&returnTo=buy-now&source=flow&previousStep=3&category=${encodeURIComponent(formData.productCategory || 'full-kit')}&q=${encodeURIComponent(searchParams.get('q') || '')}`}
                            className="text-[#273e8e] underline font-bold text-base"
                        >
                            Edit load
                        </a>
                    </p>
                )}
                {!searchParams.get('q') && <div className="mb-8" />}

                {bundlesLoading ? (
                    <div className="text-center py-16">
                        <div className="flex flex-col items-center justify-center">
                            <Loader className="animate-spin mx-auto text-[#273e8e]" size={48} />
                            <p className="mt-6 text-lg font-medium text-gray-700">Loading bundles...</p>
                            <p className="mt-2 text-sm text-gray-500">Please wait while we fetch available solar bundles</p>
                        </div>
                    </div>
                ) : filteredBundles.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                        <p className="text-gray-600 mb-4">
                            {searchParams.get('q')
                                ? "No bundle available for your load and selected category. Your load may be higher than what we have, or there are no bundles in this category. Try editing your load or choosing a different category."
                                : selectedSystemSize !== "all"
                                ? `No bundles found for ${selectedSizeLabel}.`
                                : "No bundles available at the moment."}
                        </p>
                        {selectedSystemSize !== "all" && (
                            <button
                                onClick={() => setSelectedSystemSize("all")}
                                className="mt-2 text-[#273e8e] hover:underline font-semibold text-sm"
                            >
                                Clear filter
                            </button>
                        )}
                        {bundles.length === 0 && selectedSystemSize === "all" && !searchParams.get('q') && (
                            <button
                                type="button"
                                onClick={() => {
                                    bundlesNeedRefreshRef.current = true;
                                    bundlesFetchedRef.current = false;
                                    loadBundlesForSelectionStep();
                                }}
                                className="mt-2 block mx-auto text-[#273e8e] hover:underline font-semibold text-sm"
                            >
                                Try again
                            </button>
                        )}
                        <button
                            onClick={() => setStep(3)}
                            className="mt-4 block mx-auto text-[#273e8e] hover:underline font-semibold"
                        >
                            Go back
                        </button>
                    </div>
                ) : (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
                        {paginatedBundles.map((bundle) => {
                            const price = Number(bundle.discount_price || bundle.total_price || 0);
                            const oldPrice = bundle.discount_price && bundle.total_price && bundle.discount_price < bundle.total_price
                                ? Number(bundle.total_price)
                                : null;
                            const discount = oldPrice && price < oldPrice
                                ? Math.round(((oldPrice - price) / oldPrice) * 100)
                                : 0;
                            const isSelected = formData.selectedBundleId === bundle.id;
                            const isRec = entityHighlyRecommended(bundle);
                            const isHot = entityTopDeal(bundle);
                            const isPromoHighlight = isRec || isHot;

                            const bundleItems = bundle.bundleItems ?? bundle.bundle_items ?? [];
                            
                            return (
                                <div
                                    key={bundle.id}
                                    className={`group bg-white border-2 rounded-2xl p-6 hover:shadow-xl transition-all duration-300 ${
                                        isSelected
                                            ? 'border-[#273e8e] bg-blue-50 ring-2 ring-[#273e8e]'
                                            : isPromoHighlight
                                            ? 'border-green-400 ring-2 ring-green-500 shadow-md hover:border-green-600'
                                            : 'border-gray-100 hover:border-[#273e8e]'
                                    }`}
                                >
                                    <div className="relative mb-4 rounded-lg overflow-hidden">
                                        <img
                                            src={getBundleImage(bundle)}
                                            alt={bundle.title || 'Solar Bundle'}
                                            className="w-full h-48 object-cover"
                                            onError={(e) => {
                                                // Prevent infinite loop - only set fallback if not already set
                                                if (e.target.src && !e.target.src.includes(FALLBACK_IMAGE)) {
                                                    e.target.src = FALLBACK_IMAGE;
                                                }
                                            }}
                                        />
                                        <div className="absolute top-2 left-2 z-[15] flex flex-col gap-1.5 items-start pointer-events-none max-w-[min(100%,14rem)]">
                                            <ProductPromoBadges
                                                isRecommended={isRec}
                                                isHotDeal={isHot}
                                            />
                                            {getBundleInverterRating(bundle) ? (
                                                <span className="bg-[#E8A91D] text-white text-[11px] px-2 py-1 rounded-full font-semibold shadow">
                                                    {String(getBundleInverterRating(bundle)).includes('kVA')
                                                        ? String(getBundleInverterRating(bundle))
                                                        : `${getBundleInverterRating(bundle)}kVA`}
                                                </span>
                                            ) : null}
                                        </div>
                                        {discount > 0 && (
                                            <div className="absolute top-2 right-2 z-10 bg-[#FFA500] text-white px-3 py-1 rounded-full text-sm font-bold">
                                                -{discount}%
                                            </div>
                                        )}
                                        {isSelected && (
                                            <div className="absolute inset-0 z-[5] bg-[#273e8e]/20 flex items-center justify-center">
                                                <CheckCircle size={48} className="text-[#273e8e]" />
                                            </div>
                                        )}
                                    </div>
                                    <h3 className="text-xl font-bold mb-2 text-gray-800">
                                        {bundle.title || `Bundle #${bundle.id}`}
                                    </h3>
                                    <p className="text-sm text-gray-500 mb-2">{getBundleCategoryLabel(bundle)}</p>
                                    <div className="flex items-baseline gap-2 mb-4">
                                        <span className="text-2xl font-bold text-[#273e8e]">
                                            {formatPrice(price)}
                                        </span>
                                        {oldPrice && (
                                            <span className="text-gray-400 line-through text-sm">
                                                {formatPrice(oldPrice)}
                                            </span>
                                        )}
                                    </div>
                                    
                                    {/* Learn More Button */}
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            // Fetch full bundle details with fees and navigate to details page
                                            try {
                                                setLoading(true);
                                                const token = localStorage.getItem('access_token');
                                                const response = await axios.get(API.BUNDLE_DETAILS(bundle.id), {
                                                    headers: {
                                                        Accept: 'application/json',
                                                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                                    },
                                                });
                                                
                                                const bundleDetails = response.data?.data ?? response.data;
                                                if (bundleDetails) {
                                                    setSelectedBundleDetails(bundleDetails);
                                                    setStep(3.6); // Navigate to bundle details page
                                                } else {
                                                    // Fallback to basic bundle data if details endpoint fails
                                                    setSelectedBundleDetails(bundle);
                                                    setStep(3.6);
                                                }
                                            } catch (error) {
                                                console.error("Failed to fetch bundle details:", error);
                                                // Fallback to basic bundle data
                                                setSelectedBundleDetails(bundle);
                                                setStep(3.6);
                                            } finally {
                                                setLoading(false);
                                            }
                                        }}
                                        className="w-full mb-2 py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Info size={16} />
                                        Learn More
                                    </button>
                                    
                                    {/* Select Button */}
                                    <button
                                        onClick={() => handleBundleSelect(bundle)}
                                        className={`w-full py-2 rounded-lg font-semibold transition-colors ${
                                            isSelected
                                                ? 'bg-red-600 text-white hover:bg-red-700'
                                                : 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
                                        }`}
                                    >
                                        {isSelected ? 'Remove from Selection' : 'Select Bundle'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {totalBundlePages > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-8">
                            <button
                                type="button"
                                onClick={() => handleBundlePageChange(bundleGridPage - 1)}
                                disabled={bundleGridPage === 1}
                                className="p-2 rounded-lg border border-gray-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                                aria-label="Previous page"
                            >
                                <ChevronLeft size={20} className="text-gray-700" />
                            </button>
                            <div className="flex gap-1">
                                {Array.from({ length: Math.min(5, totalBundlePages) }, (_, i) => {
                                    let pageNum;
                                    if (totalBundlePages <= 5) {
                                        pageNum = i + 1;
                                    } else if (bundleGridPage <= 3) {
                                        pageNum = i + 1;
                                    } else if (bundleGridPage >= totalBundlePages - 2) {
                                        pageNum = totalBundlePages - 4 + i;
                                    } else {
                                        pageNum = bundleGridPage - 2 + i;
                                    }
                                    return (
                                        <button
                                            type="button"
                                            key={pageNum}
                                            onClick={() => handleBundlePageChange(pageNum)}
                                            className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                                bundleGridPage === pageNum
                                                    ? 'bg-[#273e8e] text-white'
                                                    : 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
                                            }`}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}
                            </div>
                            <button
                                type="button"
                                onClick={() => handleBundlePageChange(bundleGridPage + 1)}
                                disabled={bundleGridPage === totalBundlePages}
                                className="p-2 rounded-lg border border-gray-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                                aria-label="Next page"
                            >
                                <ChevronRight size={20} className="text-gray-700" />
                            </button>
                        </div>
                    )}
                    {filteredBundles.length > 0 && (
                        <p className="text-center text-sm text-gray-500 mt-4">
                            Showing {bundleGridStart + 1} - {Math.min(bundleGridStart + BUNDLE_STEP_GRID_PAGE_SIZE, filteredBundles.length)} of {filteredBundles.length} {isInverterFlow ? 'solutions' : 'bundles'}
                        </p>
                    )}
                    </>
                )}
            </div>
        );
    };

    // Bundle Details Page (Full Page View - Step 3.6)
    const renderStep3_6 = () => {
        if (!selectedBundleDetails) {
            return (
                <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
                    <p className="text-gray-600">Returning to bundle list...</p>
                </div>
            );
        }

        const bundle = selectedBundleDetails;
        const totalPrice = Number(bundle.discount_price || bundle.total_price || 0);
        const oldPrice = bundle.discount_price && bundle.total_price && bundle.discount_price < bundle.total_price
            ? Number(bundle.total_price)
            : null;
        const discount = oldPrice && totalPrice < oldPrice
            ? Math.round(((oldPrice - totalPrice) / oldPrice) * 100)
            : 0;

        // Get items included
        const itemsIncluded = bundle.materials || bundle.bundleItems || bundle.bundle_items || [];
        const bundleSpecs = parseBundleSpecifications(bundle);
        // Description: API may send detailed_description, description, or desc
        const descriptionText = (bundle.detailed_description && String(bundle.detailed_description).trim()) || (bundle.description && String(bundle.description).trim()) || (bundle.desc && String(bundle.desc).trim()) || '';

        return (
            <div className="animate-fade-in bg-[#F5F7FF] min-h-screen p-3 sm:p-5">
                <div className="bg-[#F6F8FF] min-h-screen rounded-xl p-3 sm:p-6 shadow-sm">
                    {/* Back Button */}
                    <button 
                        onClick={() => {
                            setSelectedBundleDetails(null);
                            setStep(3.5);
                        }} 
                        className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e] transition-colors"
                    >
                        <ArrowLeft size={16} className="mr-2" /> Back to Bundles
                    </button>

                    {/* Desktop Layout */}
                    <div className="hidden sm:flex justify-between items-start gap-6">
                        {/* Left Column - Main Content */}
                        <div className="flex-1 min-w-0">
                            <div className="bg-white w-full border border-gray-200 rounded-xl mt-3 shadow-sm overflow-hidden">
                                {/* Image */}
                                <div className="relative h-[350px] bg-[#F8FAFC] m-3 rounded-lg flex justify-center items-center overflow-hidden">
                                    <img
                                        src={getBundleImage(bundle)}
                                        alt={bundle.title || 'Bundle'}
                                        className="max-h-[80%] object-contain"
                                        onError={(e) => {
                                            e.target.src = FALLBACK_IMAGE;
                                        }}
                                    />
                                </div>

                                {/* Content */}
                                <div className="p-4">
                                    <h2 className="text-xl font-semibold">
                                        {bundle.title || `Bundle #${bundle.id}`}
                                    </h2>
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
                                        <p className="text-sm text-gray-500">{getBundleCategoryLabel(bundle)}</p>
                                    </div>

                                    <hr className="my-3 text-gray-300" />

                                    {/* Price - column layout */}
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs text-gray-500 uppercase tracking-wide">Bundle Price</span>
                                        <p className="text-xl font-bold text-[#273E8E]">
                                            {formatPrice(totalPrice)}
                                        </p>
                                        <div className="flex gap-2 mt-0.5">
                                            {oldPrice && (
                                                <span className="text-sm text-gray-500 line-through">
                                                    {formatPrice(oldPrice)}
                                                </span>
                                            )}
                                            {discount > 0 && (
                                                <span className="text-xs px-2 py-[2px] bg-[#FFA500]/20 text-[#FFA500] rounded-full">
                                                    -{discount}%
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <hr className="my-2 text-gray-300" />

                                {/* Tabs: Description | Specifications */}
                                <div className="p-4">
                                    <div className="flex border-b border-gray-200 mb-4">
                                        <button
                                            type="button"
                                            onClick={() => setBundleDetailTab('description')}
                                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${bundleDetailTab === 'description' ? 'border-[#273E8E] text-[#273E8E]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                        >
                                            Description
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setBundleDetailTab('specs')}
                                            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${bundleDetailTab === 'specs' ? 'border-[#273E8E] text-[#273E8E]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                        >
                                            Specifications
                                        </button>
                                    </div>

                                    {bundleDetailTab === 'description' && (
                                        <div className="min-h-[80px] space-y-4">
                                            {descriptionText ? (
                                                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                                                    {descriptionText}
                                                </p>
                                            ) : (
                                                <p className="text-sm text-gray-400 italic">No description found.</p>
                                            )}
                                            {(bundle.system_capacity_display && String(bundle.system_capacity_display).trim()) && (
                                                <>
                                                    <h4 className="text-sm font-semibold text-gray-800 mt-3">System capacity</h4>
                                                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{bundle.system_capacity_display}</p>
                                                </>
                                            )}
                                            {(bundle.what_is_inside_bundle_text && String(bundle.what_is_inside_bundle_text).trim()) && (
                                                <>
                                                    <h4 className="text-sm font-semibold text-gray-800 mt-3">What&apos;s inside this bundle</h4>
                                                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{bundle.what_is_inside_bundle_text}</p>
                                                </>
                                            )}
                                            {(bundle.what_bundle_powers_text && String(bundle.what_bundle_powers_text).trim()) && (
                                                <>
                                                    <h4 className="text-sm font-semibold text-gray-800 mt-3">What this bundle powers</h4>
                                                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{bundle.what_bundle_powers_text}</p>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {bundleDetailTab === 'specs' && (
                                        <div className="min-h-[80px]">
                                            {Object.keys(bundleSpecs).filter(k => !SPEC_KEYS_HIDDEN.includes(k) && bundleSpecs[k] != null && bundleSpecs[k] !== '').length > 0 ? (
                                                <dl className="space-y-2 text-sm">
                                                    {Object.keys(bundleSpecs)
                                                        .filter((key) => !SPEC_KEYS_HIDDEN.includes(key) && bundleSpecs[key] != null && bundleSpecs[key] !== '')
                                                        .map((key) => {
                                                            const value = bundleSpecs[key];
                                                            const label = SPEC_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                                                            return (
                                                                <div key={key} className="flex justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
                                                                    <dt className="text-gray-600 font-medium shrink-0">{label}</dt>
                                                                    <dd className="text-gray-900 text-right">{String(value)}</dd>
                                                                </div>
                                                            );
                                                        })}
                                                </dl>
                                            ) : (
                                                <p className="text-sm text-gray-500 py-4">No specifications available.</p>
                                            )}
                                        </div>
                                    )}
                                </div>

                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-3 mt-6 px-2">
                                <button
                                    onClick={() => {
                                        handleBundleSelect(bundle);
                                        setSelectedBundleDetails(null);
                                    }}
                                    className="w-full text-sm bg-[#273E8E] text-white py-4 rounded-full hover:bg-[#1a2b6b] transition-colors"
                                >
                                    Select This Bundle
                                </button>
                            </div>
                        </div>

                        {/* Right Column - use load-calculator style summary card */}
                        <div className="w-[380px] flex-shrink-0">
                            <div className="flex flex-col gap-3 rounded-2xl">
                                <div className="bg-[#273e8e] text-white rounded-2xl px-5 py-5 flex flex-col gap-4 shadow-lg">
                                    <h3 className="text-base font-semibold border-b border-white/30 pb-2">Bundle Capacity</h3>
                                    <div>
                                        <p className="text-white/80 text-xs">Inverter Rating</p>
                                        <p className="text-lg font-bold">{getBundleInverterRating(bundle)}</p>
                                    </div>
                                    <div>
                                        <p className="text-white/80 text-xs">Battery Capacity</p>
                                        <p className="text-lg font-bold">{getBundleBatteryCapacity(bundle)}</p>
                                    </div>
                                    <div>
                                        <p className="text-white/80 text-xs">Solar Panel Capacity</p>
                                        <p className="text-lg font-bold">{getBundleSolarPanelCapacity(bundle)}</p>
                                    </div>
                                </div>

                                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                                    <h3 className="text-base font-semibold text-gray-800 mb-4">Order Summary</h3>
                                    
                                    <div className="space-y-3 mb-4">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Items</span>
                                            <span className="font-medium">1</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Bundle Price</span>
                                            <span className="font-medium">{formatPrice(totalPrice)}</span>
                                        </div>
                                    </div>

                                    <hr className="my-4 border-gray-200" />

                                    {(bundle.backup_time_description || bundle.backup_info) && (
                                        <div>
                                            <h4 className="text-sm font-semibold text-gray-800 mb-2">Backup Time</h4>
                                            <p className="text-xs text-gray-600 whitespace-pre-line">
                                                {formatBackupTime(bundle.backup_time_description || bundle.backup_info)}
                                            </p>
                                        </div>
                                    )}
                                    {bundle.fees && (bundle.fees.installation_fee > 0 || bundle.fees.delivery_fee > 0 || bundle.fees.inspection_fee > 0) && (
                                        <div className="mt-4">
                                            <h4 className="text-sm font-semibold text-gray-800 mb-2">Fees</h4>
                                            <div className="space-y-1 text-xs text-gray-600">
                                                {bundle.fees.installation_fee > 0 && (
                                                    <div className="flex justify-between">
                                                        <span>Installation</span>
                                                        <span>{formatPrice(bundle.fees.installation_fee)}</span>
                                                    </div>
                                                )}
                                                {bundle.fees.delivery_fee > 0 && (
                                                    <div className="flex justify-between">
                                                        <span>Delivery</span>
                                                        <span>{formatPrice(bundle.fees.delivery_fee)}</span>
                                                    </div>
                                                )}
                                                {bundle.fees.inspection_fee > 0 && (
                                                    <div className="flex justify-between">
                                                        <span>Inspection</span>
                                                        <span>{formatPrice(bundle.fees.inspection_fee)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Mobile Layout */}
                    <div className="sm:hidden">
                        <div className="mx-3 mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                            {/* Image */}
                            <div className="relative h-[200px] rounded-xl bg-[#F8FAFC] flex items-center justify-center overflow-hidden">
                                <img
                                    src={getBundleImage(bundle)}
                                    alt={bundle.title || 'Bundle'}
                                    className="max-h-[80%] object-contain"
                                    onError={(e) => {
                                        e.target.src = FALLBACK_IMAGE;
                                    }}
                                />
                            </div>

                            {/* Title + Price */}
                            <div className="pt-3">
                                <h2 className="text-[12px] lg:text-[16px] font-semibold text-[#0F172A]">
                                    {bundle.title || `Bundle #${bundle.id}`}
                                </h2>
                                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 mt-[2px]">
                                    <p className="text-[12px] text-gray-500">{getBundleCategoryLabel(bundle)}</p>
                                </div>

                                <div className="mt-3 flex flex-col gap-0.5">
                                    <span className="text-[10px] text-gray-500 uppercase tracking-wide">Bundle Price</span>
                                    <div className="text-[12px] lg:text-[18px] font-bold text-[#273E8E] leading-5">
                                        {formatPrice(totalPrice)}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2">
                                        {oldPrice && (
                                            <span className="text-[10px] lg:text-[12px] text-gray-400 line-through">
                                                {formatPrice(oldPrice)}
                                            </span>
                                        )}
                                        {discount > 0 && (
                                            <span className="px-2 py-[2px] rounded-full text-[11px] text-orange-600 bg-orange-100">
                                                -{discount}%
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Tabs: Description | Specifications - Mobile */}
                            <div className="mt-4">
                                <div className="flex border-b border-gray-200 mb-3">
                                    <button
                                        type="button"
                                        onClick={() => setBundleDetailTab('description')}
                                        className={`px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors ${bundleDetailTab === 'description' ? 'border-[#273E8E] text-[#273E8E]' : 'border-transparent text-gray-500'}`}
                                    >
                                        Description
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setBundleDetailTab('specs')}
                                        className={`px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors ${bundleDetailTab === 'specs' ? 'border-[#273E8E] text-[#273E8E]' : 'border-transparent text-gray-500'}`}
                                    >
                                        Specifications
                                    </button>
                                </div>

                                {bundleDetailTab === 'description' && (
                                    <div className="min-h-[60px] space-y-3">
                                        {descriptionText ? (
                                            <p className="text-[11px] lg:text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap">
                                                {descriptionText}
                                            </p>
                                        ) : (
                                            <p className="text-[11px] text-gray-400 italic">No description found.</p>
                                        )}
                                        {bundle.system_capacity_display && (
                                            <>
                                                <h4 className="text-[11px] font-semibold text-gray-800 mt-2">System capacity</h4>
                                                <p className="text-[11px] text-gray-600 whitespace-pre-wrap">{bundle.system_capacity_display}</p>
                                            </>
                                        )}
                                        {bundle.what_is_inside_bundle_text && (
                                            <>
                                                <h4 className="text-[11px] font-semibold text-gray-800 mt-2">What&apos;s inside</h4>
                                                <p className="text-[11px] text-gray-600 whitespace-pre-wrap">{bundle.what_is_inside_bundle_text}</p>
                                            </>
                                        )}
                                        {bundle.what_bundle_powers_text && (
                                            <>
                                                <h4 className="text-[11px] font-semibold text-gray-800 mt-2">What it powers</h4>
                                                <p className="text-[11px] text-gray-600 whitespace-pre-wrap">{bundle.what_bundle_powers_text}</p>
                                            </>
                                        )}
                                    </div>
                                )}

                                {bundleDetailTab === 'specs' && (
                                    <div className="min-h-[60px]">
                                        {Object.keys(bundleSpecs).filter(k => !SPEC_KEYS_HIDDEN.includes(k) && bundleSpecs[k] != null && bundleSpecs[k] !== '').length > 0 ? (
                                            <dl className="space-y-1.5 text-[11px] lg:text-[12px]">
                                                {Object.keys(bundleSpecs)
                                                    .filter((key) => !SPEC_KEYS_HIDDEN.includes(key) && bundleSpecs[key] != null && bundleSpecs[key] !== '')
                                                    .map((key) => {
                                                        const value = bundleSpecs[key];
                                                        const label = SPEC_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                                                        return (
                                                            <div key={key} className="flex justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
                                                                <dt className="text-gray-600 font-medium shrink-0">{label}</dt>
                                                                <dd className="text-gray-900 text-right">{String(value)}</dd>
                                                            </div>
                                                        );
                                                    })}
                                            </dl>
                                        ) : (
                                            <p className="text-[11px] text-gray-500 py-3">No specifications available.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Actions - Mobile */}
                            <div className="mt-4">
                                <button
                                    onClick={() => {
                                        handleBundleSelect(bundle);
                                        setSelectedBundleDetails(null);
                                    }}
                                    className="w-full h-11 rounded-full bg-[#273E8E] text-white text-[11px] lg:text-[14px] hover:bg-[#1a2b6b] transition-colors"
                                >
                                    Select This Bundle
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderStep4 = () => {
        // If audit flow, show audit type selection (same as BNPL)
        if (formData.optionType === 'audit') {
            return (
                <>
                    <div className="animate-fade-in">
                        <button onClick={() => setStep(3)} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
                            <ArrowLeft size={16} className="mr-2" /> Back
                        </button>
                        <h2 className="text-3xl font-bold text-center mb-8 text-[#273e8e]">
                            Where is the audit for?
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto animate-fade-in">
                        <button
                            type="button"
                            onClick={() => handleAuditTypeSelect('home')}
                            className="group bg-white border-2 border-gray-100 hover:border-[#273e8e] rounded-2xl p-8 hover:shadow-xl transition-all duration-300 flex flex-col items-center text-center"
                        >
                            <div className="bg-blue-50 p-6 rounded-full mb-6 group-hover:bg-[#273e8e]/10 transition-colors">
                                <Home size={40} className="text-[#273e8e]" />
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-gray-800">Home</h3>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleAuditTypeSelect('office')}
                            className="group bg-white border-2 border-gray-100 hover:border-[#273e8e] rounded-2xl p-8 hover:shadow-xl transition-all duration-300 flex flex-col items-center text-center"
                        >
                            <div className="bg-blue-50 p-6 rounded-full mb-6 group-hover:bg-[#273e8e]/10 transition-colors">
                                <Building2 size={40} className="text-[#273e8e]" />
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-gray-800">Office</h3>
                        </button>
                    </div>
                </>
            );
        }

        // Otherwise, show checkout options (OLD BEHAVIOR)
        // Determine which step to go back to
        const getBackStep = () => {
            if (formData.optionType === 'choose-system' && formData.selectedBundleId) {
                return 3.5; // Go back to bundle selection
            } else if (formData.optionType) {
                return 3; // Go back to method selection
            } else {
                return 2; // Go back to category selection
            }
        };

        return (
        <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <button onClick={() => setStep(getBackStep())} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
                <ArrowLeft size={16} className="mr-2" /> Back
            </button>
            <h2 className="text-2xl font-bold mb-6 text-[#273e8e]">Checkout Options</h2>

            {/* Installer Choice */}
            <div className="mb-8">
                <h3 className="text-lg font-bold mb-4 text-gray-800">Installation Preference</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => setFormData({ ...formData, installerChoice: 'troosolar', includeInstallationMaterial: false })}
                        className={`p-6 rounded-xl border-2 text-left transition-all ${formData.installerChoice === 'troosolar'
                            ? 'border-[#273e8e] bg-blue-50'
                            : 'border-gray-200 hover:border-blue-200'
                            }`}
                    >
                        <div className="flex items-center mb-2">
                            <CheckCircle size={20} className={formData.installerChoice === 'troosolar' ? 'text-[#273e8e]' : 'text-gray-300'} />
                            <span className="ml-2 font-bold text-gray-800">Use Troosolar Certified Installer</span>
                        </div>
                        <p className="text-sm text-gray-500 ml-7">Recommended. Includes 1-Year Installation Warranty.</p>
                    </button>

                    <button
                        onClick={() => setFormData({ ...formData, installerChoice: 'own', includeInsurance: false, includeInstallationMaterial: false })}
                        className={`p-6 rounded-xl border-2 text-left transition-all ${formData.installerChoice === 'own'
                            ? 'border-[#273e8e] bg-blue-50'
                            : 'border-gray-200 hover:border-blue-200'
                            }`}
                    >
                        <div className="flex items-center mb-2">
                            <CheckCircle size={20} className={formData.installerChoice === 'own' ? 'text-[#273e8e]' : 'text-gray-300'} />
                            <span className="ml-2 font-bold text-gray-800">Use My Own Installer</span>
                        </div>
                        <p className="text-sm text-gray-500 ml-7">Troosolar does not guarantee third-party installation.</p>
                    </button>
                </div>
            </div>

            {/* Add-Ons Section */}
            <div className="mb-8">
                <h3 className="text-lg font-bold mb-4 text-gray-800">Additional Services</h3>
                <div className="space-y-3">
                    {/* Insurance Option - only available for Troosolar installers */}
                    <label className={`flex items-start p-4 rounded-xl border-2 transition-all ${
                        formData.installerChoice === 'own' 
                            ? 'border-gray-200 bg-gray-100 cursor-not-allowed opacity-60' 
                            : formData.includeInsurance 
                                ? 'border-[#273e8e] bg-blue-50 cursor-pointer' 
                                : 'border-gray-200 cursor-pointer'
                    }`}>
                        <input
                            type="checkbox"
                            className="mt-1 h-5 w-5 text-[#273e8e] focus:ring-[#273e8e] border-gray-300 rounded"
                            checked={formData.includeInsurance}
                            disabled={formData.installerChoice === 'own'}
                            onChange={(e) => setFormData({ ...formData, includeInsurance: e.target.checked })}
                        />
                        <div className="ml-3">
                            <span className={`font-bold flex items-center ${
                                formData.installerChoice === 'own' ? 'text-gray-500' : 'text-gray-800'
                            }`}>
                                <Shield size={18} className={`mr-2 ${
                                    formData.installerChoice === 'own' ? 'text-gray-400' : 'text-[#273e8e]'
                                }`} /> Include 12months Insurance
                            </span>
                            <p className={`text-sm mt-1 ${
                                formData.installerChoice === 'own' ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                                {formData.installerChoice === 'own' 
                                    ? 'Insurance is only available with Troosolar Certified Installer.' 
                                    : `Protect your investment from fire damage and theft (${formatInsurancePercentLabel(resolveCheckoutInsurancePercent(checkoutSettings))}% of order sub-total when selected)`}
                            </p>
                        </div>
                    </label>

                    {formData.installerChoice === 'own' && (
                        <label className={`flex items-start p-4 rounded-xl border-2 cursor-pointer transition-all ${
                            formData.includeInstallationMaterial
                                ? 'border-[#273e8e] bg-blue-50'
                                : 'border-gray-200'
                        }`}>
                            <input
                                type="checkbox"
                                className="mt-1 h-5 w-5 text-[#273e8e] focus:ring-[#273e8e] border-gray-300 rounded"
                                checked={!!formData.includeInstallationMaterial}
                                onChange={(e) => setFormData({ ...formData, includeInstallationMaterial: e.target.checked })}
                            />
                            <div className="ml-3">
                                <span className="font-bold text-gray-800 flex items-center">
                                    <Wrench size={18} className="mr-2 text-[#273e8e]" />
                                    Include Cost of Installation Materials
                                </span>
                            </div>
                        </label>
                    )}

                    {/* Other Add-Ons from API */}
                    {addOns.filter(addon => !addon.is_compulsory_buy_now).map((addon) => (
                        <label
                            key={addon.id}
                            className={`flex items-start p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedAddOns.includes(addon.id) ? 'border-[#273e8e] bg-blue-50' : 'border-gray-200'
                                }`}
                        >
                            <input
                                type="checkbox"
                                className="mt-1 h-5 w-5 text-[#273e8e] focus:ring-[#273e8e] border-gray-300 rounded"
                                checked={selectedAddOns.includes(addon.id)}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setSelectedAddOns([...selectedAddOns, addon.id]);
                                    } else {
                                        setSelectedAddOns(selectedAddOns.filter(id => id !== addon.id));
                                    }
                                }}
                            />
                            <div className="ml-3 flex-1">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className="font-bold text-gray-800">{addon.title}</span>
                                        <p className="text-sm text-gray-500 mt-1">{addon.description}</p>
                                    </div>
                                    <span className="font-bold text-[#273e8e] ml-4">
                                        {addon.calculation_type === 'percentage' 
                                            ? `${addon.calculation_value}%`
                                            : `₦${formatAmount(addon.price || 0)}`
                                        }
                                    </span>
                                </div>
                            </div>
                        </label>
                    ))}
                </div>
            </div>

            {/* State and Delivery Location Selection */}
            {states.length > 0 && (
                <div className="mb-8">
                    <h3 className="text-lg font-bold mb-4 text-gray-800">Delivery Location</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                            <select
                                value={formData.stateId || ''}
                                onChange={(e) => {
                                    const stateId = e.target.value ? Number(e.target.value) : null;
                                    setFormData({ ...formData, stateId, deliveryLocationId: null });
                                    setSelectedStateId(stateId);
                                }}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#273e8e] focus:border-[#273e8e]"
                            >
                                <option value="">Select State</option>
                                {states.filter(s => s.is_active).map((state) => (
                                    <option key={state.id} value={state.id}>
                                        {state.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {selectedStateId && deliveryLocations.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Location</label>
                                <select
                                    value={formData.deliveryLocationId || ''}
                                    onChange={(e) => setFormData({ ...formData, deliveryLocationId: e.target.value ? Number(e.target.value) : null })}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#273e8e] focus:border-[#273e8e]"
                                >
                                    <option value="">Select Location</option>
                                    {deliveryLocations.filter(loc => loc.is_active).map((location) => (
                                        <option key={location.id} value={location.id}>
                                            {location.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <button
                onClick={() => setStep(7)}
                disabled={!formData.installerChoice}
                className={`w-full py-4 rounded-xl font-bold transition-colors ${formData.installerChoice
                    ? 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
            >
                View Order Summary
            </button>
            {!formData.installerChoice && (
                <p className="text-sm text-red-600 mt-2 text-center">
                    Please select an installation preference to continue
                </p>
            )}
        </div>
        );
    };

    // ── Extract order-list and invoice line items from a bundle object ──
    // Mirrors the identical function in BNPLFlow so both flows show the same data.
    const extractBundleLineItems = (bundle) => {
        const toNumber = (v) => typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0;
        const parseFeeVisibility = (title) => {
            const s = String(title || '');
            if (s.startsWith(FEE_VIS_TROO_PREFIX)) return 'troosolar';
            if (s.startsWith(FEE_VIS_OWN_PREFIX)) return 'own';
            if (s.startsWith(FEE_VIS_BOTH_PREFIX)) return 'both';
            const lower = s.toLowerCase();
            // Backward-compatible defaults for legacy untagged fee names
            if (lower.includes('material')) return 'own';
            if (lower.includes('installation fee') || lower.includes('inspection fee')) return 'troosolar';
            if (lower.includes('delivery fee') || lower.includes('delivery/logistics')) return 'both';
            return 'both';
        };
        const stripFeeVisibilityPrefix = (title) => {
            const t = String(title || '');
            if (t.startsWith(FEE_VIS_TROO_PREFIX)) return t.slice(FEE_VIS_TROO_PREFIX.length).trim();
            if (t.startsWith(FEE_VIS_OWN_PREFIX)) return t.slice(FEE_VIS_OWN_PREFIX.length).trim();
            if (t.startsWith(FEE_VIS_BOTH_PREFIX)) return t.slice(FEE_VIS_BOTH_PREFIX.length).trim();
            return t;
        };
        const feeVisibleForInstaller = (visibility, installerChoice) => {
            if (visibility === 'troosolar') return installerChoice !== 'own';
            if (visibility === 'own') return installerChoice === 'own';
            return true; // both
        };
        const parseQuantityApplies = (value) => {
            if (value === undefined || value === null || value === '') return true;
            if (typeof value === 'boolean') return value;
            const normalized = String(value).trim().toLowerCase();
            return !['false', '0', 'no', 'nil', 'n/a', 'na', 'not_applicable', 'not applicable'].includes(normalized);
        };
        const resolveQtyAndUnit = (sources = [], fallbackQty = 1, fallbackUnit = 'Nos') => {
            const firstValue = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');
            let qty;
            let unit;
            let quantityApplies;
            sources.forEach((src) => {
                if (!src || typeof src !== 'object') return;
                qty = qty ?? firstValue(src.quantity, src.qty);
                unit = unit ?? firstValue(src.unit, src.unit_name, src.measurement_unit, src.qty_unit);
                quantityApplies = quantityApplies ?? firstValue(
                    src.quantity_applies,
                    src.quantity_applicable,
                    src.is_quantity_applicable,
                    src.qty_applicable,
                    src.apply_quantity
                );
            });
            return {
                quantity: Number(qty) > 0 ? Number(qty) : fallbackQty,
                unit: String(unit || fallbackUnit),
                quantityApplies: parseQuantityApplies(quantityApplies),
            };
        };
        const isProductName = (name) => {
            if (!name) return false;
            const n = name.toLowerCase();
            return n.includes('inverter') || n.includes('battery') || n.includes('solar panel');
        };
        const isFeeName = (name) => {
            if (!name) return false;
            const n = name.toLowerCase();
            return n.includes('installation fee') || n.includes('delivery fee') || n.includes('inspection fee');
        };

        const productRows = [];
        const relItems = bundle?.bundleItems ?? bundle?.bundle_items ?? [];
        relItems.forEach((bi) => {
            const p = bi?.product || bi;
            const name = p?.title || p?.name || bi?.title || bi?.name || null;
            if (!name) return;
            const qtyMeta = resolveQtyAndUnit([bi, p], 1, 'Nos');
            productRows.push({
                description: name,
                quantity: qtyMeta.quantity,
                unit: qtyMeta.unit,
                quantityApplies: qtyMeta.quantityApplies,
                rate: toNumber(bi?.rate_override ?? (p?.price || p?.selling_price || p?.total_price || bi?.price || 0)),
            });
        });

        if (productRows.length === 0 && bundle?.product_model) {
            bundle.product_model.split('/').map(s => s.trim()).filter(Boolean).forEach((part) => {
                productRows.push({ description: part, quantity: 1, unit: 'Nos', quantityApplies: true, rate: 0 });
            });
        }

        const relMaterials = bundle?.bundle_materials ?? [];
        const materialsList = relMaterials.length > 0 ? relMaterials : (bundle?.materials ?? []);
        const pureInstallMaterials = [];
        const fallbackServiceRows = [];
        materialsList.forEach((m) => {
            const mat = m?.material || m;
            if (mat?.product) return;
            const name = mat?.name || mat?.title || '';
            const qtyMeta = resolveQtyAndUnit([m, mat], 1, /inspection/i.test(name) ? 'Lots' : 'Nos');
            const qty = qtyMeta.quantity;
            const rate = toNumber(m?.rate_override ?? (mat?.selling_rate || mat?.rate || mat?.price || 0));
            if (productRows.length === 0 && isProductName(name)) {
                productRows.push({ description: name, quantity: qty, unit: qtyMeta.unit, quantityApplies: qtyMeta.quantityApplies, rate });
            } else if (isFeeName(name)) {
                fallbackServiceRows.push({ description: name, quantity: qty, unit: qtyMeta.unit, quantityApplies: qtyMeta.quantityApplies, rate });
            } else {
                pureInstallMaterials.push({ name, qty, rate });
            }
        });

        const OL_PREFIX = '[OL]';
        const serviceRows = [];
        const customOrderItems = [];
        const parseOrderItemVisibility = (title) => {
            if (String(title || '').startsWith(OL_VIS_TROO_PREFIX)) return 'troosolar';
            if (String(title || '').startsWith(OL_VIS_OWN_PREFIX)) return 'own';
            return 'both';
        };
        const orderItemVisibleForInstaller = (visibility, installerChoice) => {
            if (visibility === 'troosolar') return installerChoice !== 'own';
            if (visibility === 'own') return installerChoice === 'own';
            return true;
        };
        const stripOrderItemPrefix = (title) => {
            const t = String(title || '');
            if (t.startsWith(OL_VIS_TROO_PREFIX)) return t.slice(OL_VIS_TROO_PREFIX.length).trim();
            if (t.startsWith(OL_VIS_OWN_PREFIX)) return t.slice(OL_VIS_OWN_PREFIX.length).trim();
            if (t.startsWith(OL_PREFIX)) return t.slice(OL_PREFIX.length).trim();
            return t;
        };
        const relServicesAll = bundle?.customServices ?? bundle?.custom_services ?? [];
        const relServices = filterBundleCustomServicesByFlow(relServicesAll, BUNDLE_CHECKOUT_FLOWS.BUY_NOW);
        const hasCustomServiceFeeRows = relServices.some((s) => {
            const t = String(s?.title || '');
            return !t.startsWith(OL_PREFIX) && !t.startsWith(OL_VIS_TROO_PREFIX) && !t.startsWith(OL_VIS_OWN_PREFIX);
        });
        const installerChoice = formData.installerChoice || 'troosolar';
        relServices.forEach((s) => {
            const rawTitle = s?.title || 'Custom Service';
            if (rawTitle.startsWith(OL_PREFIX) || rawTitle.startsWith(OL_VIS_TROO_PREFIX) || rawTitle.startsWith(OL_VIS_OWN_PREFIX)) {
                const cleanTitle = stripOrderItemPrefix(rawTitle);
                const visibility = parseOrderItemVisibility(rawTitle);
                const qtyMeta = resolveQtyAndUnit([s], 1, 'Nos');
                if (orderItemVisibleForInstaller(visibility, installerChoice)) {
                    customOrderItems.push({ description: cleanTitle, quantity: qtyMeta.quantity, unit: qtyMeta.unit, quantityApplies: qtyMeta.quantityApplies, rate: toNumber(s?.service_amount) });
                }
            } else {
                const cleanTitle = stripFeeVisibilityPrefix(rawTitle);
                const visibility = parseFeeVisibility(rawTitle);
                if (/material/i.test(cleanTitle) && !buyNowMaterialFeeApplies(installerChoice, formData.includeInstallationMaterial)) {
                    return;
                }
                const qtyMeta = resolveQtyAndUnit([s], 1, /inspection/i.test(cleanTitle) ? 'Lots' : 'Nos');
                if (feeVisibleForInstaller(visibility, installerChoice)) {
                    serviceRows.push({ description: cleanTitle, quantity: qtyMeta.quantity, unit: qtyMeta.unit, quantityApplies: qtyMeta.quantityApplies, rate: toNumber(s?.service_amount) });
                }
            }
        });
        // Invoice fees come only from admin-configured custom_services (never material fallbacks).
        const billableServiceRows = filterBillableInvoiceFees(dedupeFeeRowsByKind(serviceRows));

        const orderListItems = customOrderItems.length > 0 ? [...customOrderItems] : [...productRows];
        const invoiceItems = [...orderListItems, ...billableServiceRows];
        const orderListTotal = orderListItems.reduce((s, i) => s + (i.rate * i.quantity), 0);
        return { orderListItems, invoiceItems, serviceRows: billableServiceRows, productRows, itemsTotal: orderListTotal, hasCustomServiceFeeRows };
    };

    /** True only for real bundle checkouts — not battery/inverter/panels-only product paths. */
    const isBuyNowBundleCheckout = () => (formData.selectedBundles || []).length > 0;

    const getBuyNowCheckoutFeeFallback = () => {
        const selectedState = states.find((s) => s.id === formData.stateId);
        return resolveProductOnlyCheckoutFees({
            selectedProducts: formData.selectedProducts,
            fallbackCategory: formData.productCategory,
            checkoutSettings,
            installerChoice: formData.installerChoice || 'troosolar',
            includeInstallationMaterial: formData.includeInstallationMaterial,
            stateDeliveryFee: selectedState?.default_delivery_fee,
        });
    };

    const getBuyNowBundleServiceFees = () => {
        if (!isBuyNowBundleCheckout()) {
            return { deliveryFee: 0, installationFee: 0, inspectionFee: 0, materialCost: 0 };
        }
        const fees = aggregateBundleServiceFees(
            formData.selectedBundles,
            (bundle) => extractBundleLineItems(bundle).serviceRows
        );
        if (!buyNowMaterialFeeApplies(formData.installerChoice, formData.includeInstallationMaterial)) {
            return { ...fees, materialCost: 0 };
        }
        return fees;
    };

    /**
     * Order-list rows for Summary (step 7) and Invoice (step 7.5).
     * Catalog sub-total excludes fees; invoice step can include fee line items.
     */
    const buildBuyNowOrderListSections = ({ includeFeeLineItems = false, resolvedFees = null } = {}) => {
        const bundlesTotal = formData.selectedBundles.reduce((sum, b) => sum + (b.price * (b.quantity || 1)), 0);
        const productsTotal = formData.selectedProducts.reduce((sum, p) => sum + (p.price * (p.quantity || 1)), 0);
        const itemsSubtotal = bundlesTotal + productsTotal;
        const basePrice = itemsSubtotal > 0 ? itemsSubtotal : formData.selectedProductPrice;
        // Bundle: invoice-tab fees only. Product-only: Shop Checkout category fees.
        const feeFallback = isBuyNowBundleCheckout()
            ? { deliveryFee: 0, installationFee: 0, inspectionFee: 0, materialCost: 0 }
            : (resolvedFees || getBuyNowCheckoutFeeFallback());

        const bundleSections = formData.selectedBundles.map((sb) => {
            const bundleQty = sb.quantity || 1;
            const bundleObj = sb.bundle;
            const bundleName = bundleObj?.title || bundleObj?.name || `Bundle #${sb.id}`;
            const bundleTotalPrice = (sb.price || 0) * bundleQty;
            const { orderListItems, invoiceItems } = extractBundleLineItems(bundleObj);
            const sourceItems = includeFeeLineItems ? invoiceItems : orderListItems;

            let rows;
            if (sourceItems.length > 0) {
                rows = mapBundleLineItemsToRows(sourceItems, bundleQty, sb.id);
            } else {
                rows = [{
                    id: `b-${sb.id}`,
                    description: bundleName,
                    quantity: bundleQty,
                    unit: 'Nos',
                    rate: sb.price || 0,
                    totalCost: bundleTotalPrice,
                }];
            }

            if (includeFeeLineItems) {
                const bundleServiceFees = aggregateBundleServiceFees(
                    [sb],
                    (bundle) => extractBundleLineItems(bundle).serviceRows
                );
                const ownInstaller = formData.installerChoice === 'own';
                const bundleFeeSlice = {
                    deliveryFee: bundleServiceFees.deliveryFee || feeFallback.deliveryFee,
                    installationFee: bundleServiceFees.installationFee,
                    inspectionFee: bundleServiceFees.inspectionFee,
                    materialCost: buyNowMaterialFeeApplies(formData.installerChoice, formData.includeInstallationMaterial)
                        ? bundleServiceFees.materialCost
                        : 0,
                };
                rows = appendResolvedFeeRows(rows, bundleFeeSlice, sb.id);
            }

            return { bundleName, rows, subTotal: bundleTotalPrice };
        });

        const productRows = buildPreCheckoutStandaloneProductRows({
            selectedProducts: formData.selectedProducts,
            selectedMaterials,
            allMaterialsMap,
            categoryMaterials,
            hasSelectedBundles: formData.selectedBundles.length > 0,
        });

        if (bundleSections.length === 0 && productRows.length === 0 && (formData.selectedBundle || formData.selectedProduct)) {
            const label = formData.selectedBundle?.title || formData.selectedProduct?.title || formData.selectedProduct?.name || 'Item';
            productRows.push({ id: 'single', description: label, quantity: 1, unit: 'Nos', rate: basePrice, totalCost: basePrice });
        }

        const catalogSubtotal = bundleSections.reduce((s, sec) => s + sec.subTotal, 0)
            + productRows.reduce((s, r) => s + r.totalCost, 0);

        return {
            bundleSections,
            productRows,
            catalogSubtotal: catalogSubtotal || basePrice || 0,
            basePrice,
        };
    };

    /** Line items + payment summary for invoice (step 7.5) and payment amount (step 5). */
    const buildBuyNowInvoiceViewModel = (detailsOverride = null) => {
        const details = detailsOverride || invoiceDetails;
        const vatPercent = Number(details?.vat_percentage || checkoutSettings?.vat_percentage || 7.5);
        const insurancePercent = resolveCheckoutInsurancePercent(checkoutSettings, details);
        const hasBundles = isBuyNowBundleCheckout();
        const checkoutFeeFallback = hasBundles
            ? { deliveryFee: 0, installationFee: 0, inspectionFee: 0, materialCost: 0 }
            : getBuyNowCheckoutFeeFallback();
        const bundleServiceFees = getBuyNowBundleServiceFees();
        const { bundleSections, productRows, catalogSubtotal } = buildBuyNowOrderListSections({
            resolvedFees: checkoutFeeFallback,
        });

        let bundleInvoiceSections = bundleSections.map((sec) => ({
            bundleName: sec.bundleName,
            allRows: sec.rows,
            subTotal: sec.subTotal,
        }));

        let productInvoiceRows = productRows;

        if (Array.isArray(details?.product_line_items) && details.product_line_items.length > 0) {
            productInvoiceRows = mapApiLineItemsToInvoiceRows(details.product_line_items, 'checkout');
            const bundleLineItems = productInvoiceRows.filter((r) => !invoiceRowsIncludeFee([r], 'delivery')
                && !invoiceRowsIncludeFee([r], 'installation')
                && !invoiceRowsIncludeFee([r], 'inspection')
                && !invoiceRowsIncludeFee([r], 'material'));
            if (bundleLineItems.length > 0 && bundleInvoiceSections.length > 0) {
                bundleInvoiceSections = [{
                    ...bundleInvoiceSections[0],
                    allRows: bundleLineItems.map((row) => ({
                        id: row.id,
                        description: row.description,
                        quantity: row.quantity,
                        unit: row.unit,
                        rate: row.rate,
                        totalCost: row.totalCost,
                    })),
                }];
            }
        }

        const pricingDetails = {
            ...(details || {}),
            items_subtotal_before_discount: Number(details?.items_subtotal_before_discount) > 0
                ? Number(details.items_subtotal_before_discount)
                : catalogSubtotal,
            outright_discount_percentage: Number(details?.outright_discount_percentage ?? 10),
            insurance_fee: Number(details?.insurance_fee) > 0
                ? Number(details.insurance_fee)
                : (formData.includeInsurance
                    ? (catalogSubtotal * insurancePercent) / 100
                    : 0),
        };

        if (hasBundles) {
            // Bundles: Invoice fees tab only — never checkout category defaults.
            pricingDetails.delivery_fee = Number(bundleServiceFees.deliveryFee || 0);
            pricingDetails.installation_fee = Number(bundleServiceFees.installationFee || 0);
            pricingDetails.inspection_fee = Number(bundleServiceFees.inspectionFee || 0);
            pricingDetails.material_cost = Number(bundleServiceFees.materialCost || 0);
        } else {
            // Product-only (battery / inverter / panels): Shop Checkout fees by category.
            pricingDetails.delivery_fee = Number(checkoutFeeFallback.deliveryFee || 0);
            pricingDetails.installation_fee = Number(checkoutFeeFallback.installationFee || 0);
            pricingDetails.inspection_fee = Number(checkoutFeeFallback.inspectionFee || 0);
            pricingDetails.material_cost = Number(checkoutFeeFallback.materialCost || 0);
        }

        const invoiceTotals = computeBuyNowInvoiceTotals({
            invoiceDetails: pricingDetails,
            productInvoiceRows,
            bundleNetTotal: 0,
            catalogSubtotal,
            vatPercent,
            bundleServiceFees: hasBundles ? bundleServiceFees : {
                deliveryFee: checkoutFeeFallback.deliveryFee,
                installationFee: checkoutFeeFallback.installationFee,
                inspectionFee: checkoutFeeFallback.inspectionFee,
                materialCost: checkoutFeeFallback.materialCost,
            },
            stateFeeFallback: checkoutFeeFallback,
            bundleFeesOnly: hasBundles,
        });

        return {
            bundleInvoiceSections,
            productInvoiceRows,
            invoiceTotals,
            vatPercent,
            insurancePercent,
            catalogSubtotal,
        };
    };

    const renderBuyNowContactForm = () => (
        <div className="mb-8 p-5 rounded-xl border border-[#273e8e]/25 bg-[#f8faff]">
            <h3 className="text-lg font-bold text-[#273e8e] mb-1 flex items-center gap-2">
                <User size={22} className="shrink-0" />
                Contact Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full name *</label>
                    <input
                        type="text"
                        className="w-full p-3 border border-gray-300 rounded-lg"
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        placeholder="As on your ID / account"
                    />
                </div>
                <div>
                    <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                        <Phone size={14} /> Phone (WhatsApp) *
                    </label>
                    <input
                        type="tel"
                        className="w-full p-3 border border-gray-300 rounded-lg"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="e.g. 0803 …"
                    />
                </div>
            </div>
            {states.length > 0 ? (
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                    <select
                        className="w-full p-3 border border-gray-300 rounded-lg"
                        value={formData.stateId || ''}
                        onChange={(e) => {
                            const stateId = e.target.value ? Number(e.target.value) : null;
                            const selectedState = states.find((s) => s.id === stateId);
                            setFormData({
                                ...formData,
                                state: selectedState?.name || '',
                                stateId,
                            });
                            setSelectedStateId(stateId);
                        }}
                    >
                        <option value="">Select state</option>
                        {states.filter((s) => s.is_active).map((state) => (
                            <option key={state.id} value={state.id}>{state.name}</option>
                        ))}
                    </select>
                </div>
            ) : (
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                    <input
                        type="text"
                        className="w-full p-3 border border-gray-300 rounded-lg"
                        value={formData.state}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        placeholder="State"
                    />
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">House / plot no. *</label>
                    <input
                        type="text"
                        className="w-full p-3 border border-gray-300 rounded-lg"
                        value={formData.houseNo}
                        onChange={(e) => setFormData({ ...formData, houseNo: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Street name *</label>
                    <input
                        type="text"
                        className="w-full p-3 border border-gray-300 rounded-lg"
                        value={formData.streetName}
                        onChange={(e) => setFormData({ ...formData, streetName: e.target.value })}
                    />
                </div>
            </div>
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Landmark (optional)</label>
                <input
                    type="text"
                    className="w-full p-3 border border-gray-300 rounded-lg"
                    value={formData.landmark}
                    onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                />
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Floors (optional)</label>
                    <input
                        type="number"
                        min={0}
                        className="w-full p-3 border border-gray-300 rounded-lg"
                        value={formData.floors}
                        onChange={(e) => setFormData({ ...formData, floors: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rooms (optional)</label>
                    <input
                        type="number"
                        min={0}
                        className="w-full p-3 border border-gray-300 rounded-lg"
                        value={formData.rooms}
                        onChange={(e) => setFormData({ ...formData, rooms: e.target.value })}
                    />
                </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
                <input
                    type="checkbox"
                    checked={formData.isGatedEstate}
                    onChange={(e) => setFormData({ ...formData, isGatedEstate: e.target.checked })}
                    className="h-4 w-4 text-[#273e8e] rounded"
                />
                <span className="text-sm text-gray-700">Property is in a gated estate</span>
            </label>
            {formData.isGatedEstate && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <input
                        type="text"
                        placeholder="Estate name *"
                        className="p-3 border rounded-lg"
                        value={formData.estateName}
                        onChange={(e) => setFormData({ ...formData, estateName: e.target.value })}
                    />
                    <input
                        type="text"
                        placeholder="Estate address *"
                        className="p-3 border rounded-lg"
                        value={formData.estateAddress}
                        onChange={(e) => setFormData({ ...formData, estateAddress: e.target.value })}
                    />
                </div>
            )}
            {!buyNowContactComplete() && (
                <p className="text-sm text-amber-700 mt-3">Fill name, phone, state, house no., and street to continue.</p>
            )}
        </div>
    );

    const renderBuyNowContactSummary = () => {
        const addressLine = formatBuyNowInstallationAddress();
        return (
            <div className="mb-6 p-5 rounded-xl border border-gray-200 bg-gray-50">
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3">
                    Customer details
                </h3>
                <div className="space-y-2 text-sm text-gray-700">
                    <p className="flex items-start gap-2">
                        <User size={16} className="shrink-0 mt-0.5 text-[#273e8e]" />
                        <span><span className="font-medium text-gray-900">Contact name:</span> {formData.fullName || '—'}</span>
                    </p>
                    <p className="flex items-start gap-2">
                        <Phone size={16} className="shrink-0 mt-0.5 text-[#273e8e]" />
                        <span><span className="font-medium text-gray-900">Phone:</span> {formData.phone || '—'}</span>
                    </p>
                    <p className="flex items-start gap-2">
                        <MapPin size={16} className="shrink-0 mt-0.5 text-[#273e8e]" />
                        <span><span className="font-medium text-gray-900">Address:</span> {addressLine || '—'}</span>
                    </p>
                </div>
            </div>
        );
    };

    const enrichBundlesForOrderSummary = async () => {
        const token = localStorage.getItem('access_token');
        const toEnrich = formData.selectedBundles;
        if (toEnrich.length === 0) return;
        setEnrichingBundles(true);
        try {
            const results = await Promise.all(
                toEnrich.map(async (sb) => {
                    try {
                        const res = await axios.get(API.BUNDLE_DETAILS(sb.id), {
                            headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                        });
                        const detail = res.data?.data ?? res.data;
                        return { id: sb.id, detail };
                    } catch {
                        return { id: sb.id, detail: null };
                    }
                })
            );
            const updated = { ...enrichedBundles };
            results.forEach(r => { if (r.detail) updated[r.id] = r.detail; });
            setEnrichedBundles(updated);
            // Also merge full detail into formData.selectedBundles[*].bundle so extractBundleLineItems works
            setFormData(prev => ({
                ...prev,
                selectedBundles: prev.selectedBundles.map(sb => {
                    const full = updated[sb.id];
                    if (full) return { ...sb, bundle: { ...sb.bundle, ...full } };
                    return sb;
                }),
            }));
        } finally {
            setEnrichingBundles(false);
        }
    };

    const renderInstallationDatePicker = () => {
        if (formData.optionType === 'audit') return null;

        const ownInstaller = formData.installerChoice === 'own';
        const uniqueDates = uniqueCalendarDates(calendarSlots).slice(0, 9);

        return (
            <div className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h3 className="font-bold text-[#273e8e] mb-3 flex items-center">
                    <Calendar size={20} className="mr-2" />
                    {ownInstaller ? 'Available Delivery Dates' : 'Available Installation Dates'}
                </h3>
                {ownInstaller ? (
                    <>
                        <p className="text-sm text-gray-600 mb-3">
                            <strong>Estimated dates:</strong> These calendar options are typical availability windows. Final delivery date and time are confirmed after payment and scheduled by our team.
                        </p>
                        <p className="text-sm text-gray-600 mb-3">
                            Pick your preferred delivery date below:
                        </p>
                    </>
                ) : (
                    <>
                        <p className="text-sm text-gray-600 mb-3">
                            <strong>Estimated dates:</strong> these calendar options are typical availability windows. Final installation date and time are confirmed after payment and a quick site coordination call.
                        </p>
                        <p className="text-sm text-gray-600 mb-3">
                            Slots usually open from 72 hours after payment confirmation. Pick your preferred day below (exact time is scheduled with our team):
                        </p>
                    </>
                )}

                {calendarSlotsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                        <Loader className="animate-spin" size={16} />
                        Loading available dates…
                    </div>
                ) : uniqueDates.length === 0 ? (
                    <p className="text-sm text-amber-700 py-2">
                        No dates available right now. You can still proceed — our team will contact you to schedule.
                    </p>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                        {uniqueDates.map((slot, idx) => {
                            const dateStr = new Date(`${slot.date}T12:00:00`).toLocaleDateString('en-NG', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                            });
                            const slotDayKey = String(slot.date).slice(0, 10);
                            const selectedDayKey = selectedSlot?.date
                                ? String(selectedSlot.date).slice(0, 10)
                                : '';
                            const isSelected = selectedDayKey === slotDayKey;

                            return (
                                <button
                                    key={`${slotDayKey}-${idx}`}
                                    type="button"
                                    disabled={!slot.available}
                                    onClick={() => {
                                        if (!slot.available) return;
                                        const firstSlotForDate = calendarSlots.find(
                                            (s) =>
                                                String(s.date).slice(0, 10) === slotDayKey && s.available
                                        );
                                        if (firstSlotForDate) setSelectedSlot(firstSlotForDate);
                                    }}
                                    className={`p-3 rounded-lg text-sm border transition-colors ${
                                        isSelected
                                            ? 'border-[#273e8e] bg-[#273e8e] text-white'
                                            : slot.available
                                                ? 'border-blue-300 hover:bg-blue-100 text-gray-800'
                                                : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    <div className="font-medium text-center">{dateStr}</div>
                                </button>
                            );
                        })}
                    </div>
                )}

                {selectedSlot?.date && (
                    <p className="mt-3 text-sm text-[#273e8e] font-medium">
                        Selected {ownInstaller ? 'delivery' : 'installation'} date:{' '}
                        {new Date(`${String(selectedSlot.date).slice(0, 10)}T12:00:00`).toLocaleDateString('en-NG', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                        })}
                    </p>
                )}
            </div>
        );
    };

    /** Shown after any audit request (home / office / commercial) — no order summary or invoice. */
    const renderAuditFlowSuccessScreen = () => {
        const auditKindLabel =
            formData.auditType === 'commercial'
                ? 'commercial / industrial'
                : formData.auditSubtype === 'office'
                    ? 'office'
                    : 'home';
        const reqId = auditRequestId || formData.auditRequestId;

        return (
            <div className="animate-fade-in max-w-lg w-full mx-auto text-center px-2">
                <div className="bg-[#FFFDF8] border border-amber-100/80 shadow-sm p-8 md:p-10 rounded-2xl">
                    <div className="w-16 h-16 rounded-full bg-amber-100/90 flex items-center justify-center mx-auto mb-6 ring-4 ring-amber-50">
                        <AlertCircle className="w-9 h-9 text-amber-800/90" strokeWidth={2.25} />
                    </div>
                    <h2 className="text-2xl font-bold mb-4 text-[#1e3a5f]">Audit Request Submitted</h2>
                    <p className="text-gray-600 mb-3 text-[15px] leading-relaxed">
                        Your {auditKindLabel} audit request has been submitted successfully{' '}
                        <span className="whitespace-nowrap">(Request ID: #{reqId})</span>.
                    </p>
                    <p className="text-gray-600 mb-8 text-[15px] leading-relaxed">
                        Our team will contact you within 24 - 72 hours to discuss your energy audit.
                    </p>
                    <div className="space-y-3">
                        <button
                            type="button"
                            onClick={() => navigate('/')}
                            className="w-full bg-[#273e8e] text-white px-8 py-3.5 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors shadow-sm"
                        >
                            Return to Dashboard
                        </button>
                        <button
                            type="button"
                            onClick={() => handleCheckAuditRequestStatus(reqId)}
                            disabled={checkingAuditStatus}
                            className="w-full border-2 border-gray-300 bg-white text-[#273e8e] px-8 py-3.5 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                        >
                            {checkingAuditStatus ? 'Checking...' : 'Check Audit Request Status'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderStep7 = () => {
        if (formData.optionType === 'audit') {
            return renderAuditFlowSuccessScreen();
        }

        // ── STEP 7: ORDER SUMMARY (contact info + order list; same rows/prices as Invoice) ──
        const { bundleSections, productRows, catalogSubtotal, basePrice } = buildBuyNowOrderListSections();

        return (
            <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <button onClick={() => setStep(4)} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
                    <ArrowLeft size={16} className="mr-2" /> Back
                </button>
                <h2 className="text-2xl font-bold mb-4 text-[#273e8e] border-b pb-4">Order Summary</h2>

                {renderBuyNowContactForm()}

                {enrichingBundles && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                        <Loader className="animate-spin" size={16} /> Loading item details...
                    </div>
                )}

                {bundleSections.map((section, sIdx) => (
                    <div key={`section-${sIdx}`} className="mb-6">
                        <h3 className="text-base font-semibold text-[#273e8e] mb-2 uppercase tracking-wide">
                            Order List — {section.bundleName}
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="border-b-2 border-gray-300 bg-gray-50">
                                        <th className="py-3 px-2 font-semibold text-gray-700">ITEM DESCRIPTION</th>
                                        <th className="py-3 px-2 font-semibold text-gray-700 text-center w-16">QTY</th>
                                        <th className="py-3 px-2 font-semibold text-gray-700 text-center w-16">UNIT</th>
                                        <th className="py-3 px-2 font-semibold text-gray-700 text-right w-28">RATE</th>
                                        <th className="py-3 px-2 font-semibold text-gray-700 text-right w-32">TOTAL COST</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {section.rows.map((row) => (
                                        <tr key={row.id} className="border-b border-gray-100">
                                            <td className="py-3 px-2 text-gray-800">{stripFeeVisibilityPrefix(row.description)}</td>
                                            <td className="py-3 px-2 text-center">{row.quantity}</td>
                                            <td className="py-3 px-2 text-center text-gray-600">{row.unit}</td>
                                            <td className="py-3 px-2 text-right text-gray-600">{row.rate > 0 ? `₦${formatAmount(row.rate)}` : <span className="italic text-gray-400">Included</span>}</td>
                                            <td className="py-3 px-2 text-right font-semibold">{row.totalCost > 0 ? `₦${formatAmount(row.totalCost)}` : <span className="italic text-gray-400">Included</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-gray-300">
                                        <td colSpan={4} className="py-3 px-2 font-bold text-gray-800">Sub-Total</td>
                                        <td className="py-3 px-2 text-right font-bold text-lg">₦{formatAmount(section.subTotal)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                ))}

                {productRows.length > 0 && (
                    <div className="mb-6">
                        {bundleSections.length > 0 && (
                            <h3 className="text-base font-semibold text-[#273e8e] mb-2 uppercase tracking-wide">
                                Individual Products
                            </h3>
                        )}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-sm">
                                <thead>
                                    <tr className="border-b-2 border-gray-300 bg-gray-50">
                                        <th className="py-3 px-2 font-semibold text-gray-700">ITEM DESCRIPTION</th>
                                        <th className="py-3 px-2 font-semibold text-gray-700 text-center w-16">QTY</th>
                                        <th className="py-3 px-2 font-semibold text-gray-700 text-center w-16">UNIT</th>
                                        <th className="py-3 px-2 font-semibold text-gray-700 text-right w-28">RATE</th>
                                        <th className="py-3 px-2 font-semibold text-gray-700 text-right w-32">TOTAL COST</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {productRows.map((row) => (
                                        <tr key={row.id} className="border-b border-gray-100">
                                            <td className="py-3 px-2 text-gray-800">{stripFeeVisibilityPrefix(row.description)}</td>
                                            <td className="py-3 px-2 text-center">{row.quantity}</td>
                                            <td className="py-3 px-2 text-center text-gray-600">{row.unit}</td>
                                            <td className="py-3 px-2 text-right">₦{formatAmount(row.rate)}</td>
                                            <td className="py-3 px-2 text-right font-semibold">₦{formatAmount(row.totalCost)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-gray-300">
                                        <td colSpan={4} className="py-3 px-2 font-bold text-gray-800">Sub-Total</td>
                                        <td className="py-3 px-2 text-right font-bold text-lg">₦{formatAmount(productRows.reduce((s, r) => s + r.totalCost, 0))}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                )}

                {(bundleSections.length + (productRows.length > 0 ? 1 : 0)) > 1 && (
                    <div className="border-t-2 border-[#273e8e] pt-3 mb-6 flex justify-between items-center">
                        <span className="font-bold text-lg text-gray-800">Overall Sub-Total</span>
                        <span className="font-bold text-xl text-[#273e8e]">₦{formatAmount(catalogSubtotal || basePrice || 0)}</span>
                    </div>
                )}

                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
                    <p className="text-sm text-blue-700">
                        <strong>Note:</strong> This is your order list. The full invoice with fees, VAT, and grand total will be shown on the next step.
                    </p>
                </div>

                <button
                    onClick={() => {
                        if (!buyNowContactComplete()) {
                            alert('Please complete your contact information before proceeding to the invoice.');
                            return;
                        }
                        setStep(7.5);
                    }}
                    disabled={!buyNowContactComplete()}
                    className={`w-full py-4 rounded-xl font-bold transition-colors ${
                        buyNowContactComplete()
                            ? 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
                            : 'bg-gray-400 text-white cursor-not-allowed'
                    }`}
                >
                    Proceed to Invoice
                </button>
            </div>
        );
    };

    const renderStep7_5 = () => {
        if (formData.optionType === 'audit') {
            return renderAuditFlowSuccessScreen();
        }

        const {
            bundleInvoiceSections,
            productInvoiceRows,
            invoiceTotals,
            vatPercent,
            insurancePercent,
            catalogSubtotal,
        } = buildBuyNowInvoiceViewModel();

        const {
            subTotalBeforeDiscount,
            effectiveOutrightDiscount,
            outrightDiscountPct,
            discountedSubTotal,
            deliveryFee,
            installationFee,
            materialCost,
            inspectionFee,
            totalAmount,
            insuranceAmount,
            vatAmount,
            grandTotal,
        } = invoiceTotals;

        return (
            <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <button onClick={() => setStep(7)} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
                    <ArrowLeft size={16} className="mr-2" /> Back
                </button>

                {orderId ? (
                    <p className="text-sm font-semibold text-[#273e8e] mb-2">Invoice #{orderId}</p>
                ) : null}
                <h2 className="text-2xl font-bold mb-4 text-[#273e8e] border-b pb-4">Invoice</h2>

                {renderBuyNowContactSummary()}

                {bundleInvoiceSections.map((section, sIdx) => (
                    <div key={`inv-section-${sIdx}`} className="mb-8">
                        <h3 className="text-base font-semibold text-[#273e8e] mb-3 uppercase tracking-wide">
                            Order list — {section.bundleName}
                        </h3>
                        <BuyNowLineItemsTable rows={section.allRows} />
                    </div>
                ))}

                {productInvoiceRows.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-base font-semibold text-[#273e8e] mb-3 uppercase tracking-wide">
                            {bundleInvoiceSections.length > 0 ? 'Additional products' : 'Order items'}
                        </h3>
                        <BuyNowLineItemsTable rows={productInvoiceRows} />
                    </div>
                )}

                <div className="flex justify-between items-center border-t-2 border-[#273e8e] pt-3 mb-6">
                    <span className="font-bold text-lg text-gray-800">Order Sub-Total</span>
                    <span className="font-bold text-xl text-[#273e8e] tabular-nums">₦{formatAmount(catalogSubtotal)}</span>
                </div>

                <PaymentSummaryCard
                    subTotalBeforeDiscount={subTotalBeforeDiscount}
                    effectiveOutrightDiscount={effectiveOutrightDiscount}
                    outrightDiscountPct={outrightDiscountPct}
                    discountedSubTotal={discountedSubTotal}
                    deliveryFee={deliveryFee}
                    installationFee={installationFee}
                    materialCost={materialCost}
                    inspectionFee={inspectionFee}
                    totalAmount={totalAmount}
                    vatAmount={vatAmount}
                    vatPercent={vatPercent}
                    insuranceAmount={insuranceAmount}
                    insurancePercent={insurancePercent}
                    grandTotal={grandTotal}
                    showInsurance={formData.includeInsurance}
                />

                {renderInstallationDatePicker()}

                <button
                    onClick={handleCheckoutSubmit}
                    disabled={loading || !buyNowContactComplete()}
                    className={`w-full py-4 rounded-xl font-bold transition-colors ${loading || !buyNowContactComplete()
                        ? 'bg-gray-400 text-white cursor-not-allowed'
                        : 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
                    }`}
                >
                    {loading ? (
                        <span className="flex items-center justify-center">
                            <Loader className="animate-spin mr-2" size={20} />
                            Processing...
                        </span>
                    ) : (
                        'Confirm & Proceed to Payment'
                    )}
                </button>
            </div>
        );
    };

    const renderStep8 = () => {
        if (!invoiceDetails) {
            return (
                <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
                    <Loader className="animate-spin mx-auto text-[#273e8e]" size={40} />
                    <p className="text-gray-600 mt-4">Loading order details...</p>
                </div>
            );
        }

        if (formData.optionType === 'audit') {
            return renderAuditFlowSuccessScreen();
        }

        // Non-audit: order confirmed — skip to payment (step 5).
        // The user already reviewed Order Summary (step 7) and Invoice (step 7.5),
        // so we don't show them again here.
        return (
            <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
                <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-6">
                    <p className="text-sm text-green-700"><strong>✓ Order confirmed!</strong> Redirecting to payment…</p>
                </div>
                <Loader className="animate-spin mx-auto text-[#273e8e]" size={40} />
            </div>
        );
    };

    const renderStep5 = () => {
        // Audit: facility/property form — always on step 5 until submit (never gated by stale invoiceDetails)
        if (
            formData.optionType === 'audit' &&
            (formData.auditType === 'commercial' || formData.auditType === 'home-office')
        ) {
            const isCommercial = formData.auditType === 'commercial';
            const isOffice = formData.auditType === 'home-office' && formData.auditSubtype === 'office';
            const isHome = formData.auditType === 'home-office' && !isOffice;
            const auditBackStep = isCommercial ? 1 : 4;
            const formTitle = isCommercial
                ? 'Commercial/Industrial Details'
                : isOffice
                    ? 'Office Details'
                    : 'Property Details';

            const stateBlockBn = (
                <>
                    {states.length > 0 ? (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">State *</label>
                            <select
                                required
                                className="w-full p-3 border rounded-lg"
                                value={formData.stateId ?? ''}
                                onChange={(e) => {
                                    const stateId = e.target.value ? Number(e.target.value) : null;
                                    const selectedState = states.find((s) => s.id === stateId);
                                    setFormData({ ...formData, state: selectedState?.name || '', stateId });
                                }}
                            >
                                <option value="">Select State</option>
                                {states.filter((s) => s.is_active).map((state) => (
                                    <option key={state.id} value={state.id}>
                                        {state.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">State *</label>
                            <input
                                type="text"
                                placeholder="State"
                                required
                                className="w-full p-3 border rounded-lg"
                                value={formData.state}
                                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                            />
                        </div>
                    )}
                </>
            );

            const homeInvalidBn =
                loading ||
                !formData.fullName ||
                !formData.phone ||
                !formData.state ||
                !formData.houseNo ||
                !formData.streetName ||
                !formData.buildingType?.trim() ||
                !formData.landmark?.trim() ||
                !formData.floors ||
                !formData.rooms ||
                (formData.isGatedEstate && (!formData.estateName || !formData.estateAddress)) ||
                !formData.preferredAuditDate ||
                !formData.preferredAuditTime;

            const officeInvalidBn =
                loading ||
                !formData.companyName?.trim() ||
                !formData.fullName?.trim() ||
                !formData.phone?.trim() ||
                !formData.state ||
                !formData.officeAddress?.trim() ||
                !formData.landmark?.trim() ||
                !formData.buildingType?.trim() ||
                !formData.floors ||
                !formData.officeSpaces ||
                (formData.isGatedEstate && (!formData.estateName || !formData.estateAddress)) ||
                !formData.preferredAuditDate ||
                !formData.preferredAuditTime;

            const commercialInvalidBn =
                loading ||
                !formData.companyName?.trim() ||
                !formData.fullName?.trim() ||
                !formData.phone?.trim() ||
                !formData.state ||
                !formData.commercialAddress?.trim() ||
                !formData.landmark?.trim() ||
                !formData.facilityDescription?.trim() ||
                !formData.preferredAuditDate ||
                !formData.preferredAuditTime;

            const submitDisabledBn = isCommercial ? commercialInvalidBn : isOffice ? officeInvalidBn : homeInvalidBn;

            return (
                <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                    <button
                        type="button"
                        onClick={() => setStep(auditBackStep)}
                        className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]"
                    >
                        <ArrowLeft size={16} className="mr-2" /> Back
                    </button>

                    {cartToken && cartItems.length > 0 && (
                        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-start">
                                <CheckCircle size={20} className="text-blue-600 mr-3 mt-0.5" />
                                <div className="flex-1">
                                    <h3 className="font-semibold text-blue-800 mb-2">Custom Order Items Loaded</h3>
                                    <p className="text-sm text-blue-700 mb-3">
                                        Your cart contains {cartItems.length} item{cartItems.length !== 1 ? 's' : ''} prepared by
                                        admin.
                                    </p>
                                    <div className="space-y-2">
                                        {cartItems.map((item, idx) => (
                                            <div key={idx} className="text-sm text-blue-600 bg-white p-2 rounded border border-blue-200">
                                                <span className="font-medium">
                                                    {item.itemable?.title || item.itemable?.name || `Item #${item.itemable_id}`}
                                                </span>
                                                <span className="ml-2">(₦{formatAmount(item.unit_price || 0)})</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {cartLoading && (
                        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <div className="flex items-center">
                                <Loader className="animate-spin text-yellow-600 mr-3" size={20} />
                                <p className="text-sm text-yellow-700">Loading cart items...</p>
                            </div>
                        </div>
                    )}

                    {cartError && (
                        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                            <div className="flex items-center">
                                <AlertCircle size={20} className="text-red-600 mr-3" />
                                <p className="text-sm text-red-700">{cartError}</p>
                            </div>
                        </div>
                    )}

                    <h2 className="text-2xl font-bold mb-6 text-[#273e8e]">{formTitle}</h2>
                    <form onSubmit={handleAuditAddressSubmit} className="space-y-4">
                        {isCommercial && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Company Name *</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full p-3 border rounded-lg"
                                        value={formData.companyName}
                                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Contact Person Name *</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full p-3 border rounded-lg"
                                            value={formData.fullName}
                                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Contact Phone Number *</label>
                                        <input
                                            type="tel"
                                            required
                                            className="w-full p-3 border rounded-lg"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                {stateBlockBn}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Address *</label>
                                    <textarea
                                        required
                                        rows={3}
                                        className="w-full p-3 border rounded-lg"
                                        value={formData.commercialAddress}
                                        onChange={(e) => setFormData({ ...formData, commercialAddress: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Current Power Sources and Capacity *</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full p-3 border rounded-lg"
                                        placeholder="e.g., grid, diesel generator(kVA), inverter(kVA/kW)"
                                        value={formData.landmark}
                                        onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Description of facility *</label>
                                    <textarea
                                        required
                                        rows={4}
                                        className="w-full p-3 border rounded-lg"
                                        value={formData.facilityDescription}
                                        onChange={(e) => setFormData({ ...formData, facilityDescription: e.target.value })}
                                    />
                                </div>
                            </>
                        )}

                        {isOffice && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Company Name *</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full p-3 border rounded-lg"
                                        value={formData.companyName}
                                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Contact Person Name *</label>
                                        <input
                                            type="text"
                                            required
                                            className="w-full p-3 border rounded-lg"
                                            value={formData.fullName}
                                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Contact Phone Number *</label>
                                        <input
                                            type="tel"
                                            required
                                            className="w-full p-3 border rounded-lg"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                {stateBlockBn}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Address *</label>
                                    <textarea
                                        required
                                        rows={3}
                                        className="w-full p-3 border rounded-lg"
                                        value={formData.officeAddress}
                                        onChange={(e) => setFormData({ ...formData, officeAddress: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Current Power Sources and Capacity *</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full p-3 border rounded-lg"
                                        placeholder="e.g., grid, diesel generator(kVA), inverter(kVA/kW)"
                                        value={formData.landmark}
                                        onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Type of building *</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full p-3 border rounded-lg"
                                        value={formData.buildingType}
                                        onChange={(e) => setFormData({ ...formData, buildingType: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">No. of floors *</label>
                                        <input
                                            type="number"
                                            required
                                            min="0"
                                            className="w-full p-3 border rounded-lg"
                                            value={formData.floors}
                                            onChange={(e) => setFormData({ ...formData, floors: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">No. of office spaces *</label>
                                        <input
                                            type="number"
                                            required
                                            min="0"
                                            className="w-full p-3 border rounded-lg"
                                            value={formData.officeSpaces}
                                            onChange={(e) => setFormData({ ...formData, officeSpaces: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.isGatedEstate}
                                            onChange={(e) => setFormData({ ...formData, isGatedEstate: e.target.checked })}
                                            className="h-5 w-5 text-[#273e8e] focus:ring-[#273e8e] border-gray-300 rounded"
                                        />
                                        <span className="text-gray-700">Is this property in a gated estate?</span>
                                    </label>
                                </div>
                                {formData.isGatedEstate && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                                        <input
                                            type="text"
                                            placeholder="Estate Name *"
                                            required={formData.isGatedEstate}
                                            className="p-3 border rounded-lg"
                                            value={formData.estateName}
                                            onChange={(e) => setFormData({ ...formData, estateName: e.target.value })}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Estate Address *"
                                            required={formData.isGatedEstate}
                                            className="p-3 border rounded-lg"
                                            value={formData.estateAddress}
                                            onChange={(e) => setFormData({ ...formData, estateAddress: e.target.value })}
                                        />
                                    </div>
                                )}
                            </>
                        )}

                        {isHome && (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Contact Name *</label>
                                        <input
                                            type="text"
                                            placeholder="Full Name"
                                            required
                                            className="w-full p-3 border rounded-lg"
                                            value={formData.fullName}
                                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Contact Phone *</label>
                                        <input
                                            type="tel"
                                            placeholder="Phone Number"
                                            required
                                            className="w-full p-3 border rounded-lg"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        />
                                    </div>
                                </div>
                                {stateBlockBn}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">House No *</label>
                                    <input
                                        type="text"
                                        placeholder="House Number"
                                        required
                                        className="w-full p-3 border rounded-lg"
                                        value={formData.houseNo}
                                        onChange={(e) => setFormData({ ...formData, houseNo: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Street Name *</label>
                                    <input
                                        type="text"
                                        placeholder="Street Name"
                                        required
                                        className="w-full p-3 border rounded-lg"
                                        value={formData.streetName}
                                        onChange={(e) => setFormData({ ...formData, streetName: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Type of building *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Bungalow, duplex, detached"
                                        className="w-full p-3 border rounded-lg"
                                        value={formData.buildingType}
                                        onChange={(e) => setFormData({ ...formData, buildingType: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Current Power Sources and Capacity *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g., grid, diesel generator(kVA), inverter(kVA/kW)"
                                        className="w-full p-3 border rounded-lg"
                                        value={formData.landmark}
                                        onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Number of Floors *</label>
                                        <input
                                            type="number"
                                            placeholder="Floors"
                                            required
                                            min="0"
                                            className="w-full p-3 border rounded-lg"
                                            value={formData.floors}
                                            onChange={(e) => setFormData({ ...formData, floors: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Number of Rooms *</label>
                                        <input
                                            type="number"
                                            placeholder="Rooms"
                                            required
                                            min="0"
                                            className="w-full p-3 border rounded-lg"
                                            value={formData.rooms}
                                            onChange={(e) => setFormData({ ...formData, rooms: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.isGatedEstate}
                                            onChange={(e) => setFormData({ ...formData, isGatedEstate: e.target.checked })}
                                            className="h-5 w-5 text-[#273e8e] focus:ring-[#273e8e] border-gray-300 rounded"
                                        />
                                        <span className="text-gray-700">Is this property in a gated estate?</span>
                                    </label>
                                </div>
                                {formData.isGatedEstate && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                                        <input
                                            type="text"
                                            placeholder="Estate Name *"
                                            required={formData.isGatedEstate}
                                            className="p-3 border rounded-lg"
                                            value={formData.estateName}
                                            onChange={(e) => setFormData({ ...formData, estateName: e.target.value })}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Estate Address *"
                                            required={formData.isGatedEstate}
                                            className="p-3 border rounded-lg"
                                            value={formData.estateAddress}
                                            onChange={(e) => setFormData({ ...formData, estateAddress: e.target.value })}
                                        />
                                    </div>
                                )}
                            </>
                        )}

                        <AuditPreferredScheduleFields
                            preferredAuditDate={formData.preferredAuditDate}
                            preferredAuditTime={formData.preferredAuditTime}
                            onDateChange={(value) => setFormData({ ...formData, preferredAuditDate: value })}
                            onTimeChange={(value) => setFormData({ ...formData, preferredAuditTime: value })}
                        />

                        <button
                            type="submit"
                            disabled={submitDisabledBn}
                            className={`w-full py-4 rounded-xl font-bold transition-colors ${
                                submitDisabledBn
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
                            }`}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center">
                                    <Loader className="animate-spin mr-2" size={20} />
                                    Submitting...
                                </span>
                            ) : (
                                'Continue'
                            )}
                        </button>
                        {submitDisabledBn && !loading && (
                            <p className="text-sm text-red-600 text-center">Please fill in all required fields.</p>
                        )}
                    </form>
                </div>
            );
        }

        // Non-audit: payment portal only — invoice was already shown on step 7.5
        const { invoiceTotals, vatPercent, insurancePercent } = buildBuyNowInvoiceViewModel(invoiceDetails);
        const {
            subTotalBeforeDiscount,
            effectiveOutrightDiscount,
            outrightDiscountPct,
            discountedSubTotal,
            deliveryFee,
            installationFee,
            materialCost,
            inspectionFee,
            totalAmount,
            vatAmount,
            insuranceAmount,
            grandTotal,
        } = invoiceTotals;

        return (
        <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <button onClick={() => setStep(7.5)} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
                <ArrowLeft size={16} className="mr-2" /> Back to Invoice
            </button>
            <h2 className="text-2xl font-bold mb-2 text-[#273e8e] border-b pb-4">Payment</h2>
            <p className="text-sm text-gray-600 mb-6">
                Order <span className="font-semibold text-[#273e8e]">#{orderId || 'Pending'}</span> is confirmed.
                Complete payment below to finalize your purchase.
            </p>

            <PaymentSummaryCard
                subTotalBeforeDiscount={subTotalBeforeDiscount}
                effectiveOutrightDiscount={effectiveOutrightDiscount}
                outrightDiscountPct={outrightDiscountPct}
                discountedSubTotal={discountedSubTotal}
                deliveryFee={deliveryFee}
                installationFee={installationFee}
                materialCost={materialCost}
                inspectionFee={inspectionFee}
                totalAmount={totalAmount}
                vatAmount={vatAmount}
                vatPercent={vatPercent}
                insuranceAmount={insuranceAmount}
                insurancePercent={insurancePercent}
                grandTotal={grandTotal}
                showInsurance={formData.includeInsurance}
            />

            <button 
                onClick={handleProceedToPayment}
                disabled={processingPayment}
                className={`w-full py-4 rounded-xl font-bold transition-colors flex items-center justify-center ${
                    processingPayment
                        ? 'bg-gray-400 text-white cursor-not-allowed'
                        : 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
                }`}
            >
                {processingPayment ? (
                    <>
                        <Loader className="animate-spin mr-2" size={20} />
                        Processing Payment...
                    </>
                ) : (
                    'Proceed to Payment'
                )}
            </button>
        </div>
        );
    };

    const renderStep6 = () => {
        if (formData.optionType === 'audit') {
            return renderAuditFlowSuccessScreen();
        }

        // Otherwise, show payment result (OLD BEHAVIOR)
        return (
        <div className="animate-fade-in max-w-3xl mx-auto text-center">
            {paymentResult === 'success' ? (
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-green-200">
                    <CheckCircle2 size={64} className="text-green-600 mx-auto mb-6" />
                    <h2 className="text-3xl font-bold mb-4 text-green-700">Payment Successful!</h2>
                    <p className="text-gray-600 mb-6">
                        Your order has been confirmed. Order ID: <span className="font-bold text-[#273e8e]">#{orderId}</span>
                    </p>
                    {selectedSlot && (
                        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
                            <p className="text-sm text-blue-700">
                                <Calendar size={16} className="inline mr-2" />
                                {formData.installerChoice === 'own'
                                    ? 'Delivery scheduled for:'
                                    : 'Installation scheduled for:'}{' '}
                                <span className="font-bold">
                                    {new Date(selectedSlot.date).toLocaleDateString('en-NG', { weekday: 'long', month: 'long', day: 'numeric' })}
                                </span>
                            </p>
                        </div>
                    )}
                    <div className="space-y-3">
                        <button
                            onClick={() => navigate(`/more?section=myOrders&orderId=${orderId}`)}
                            className="w-full bg-[#273e8e] text-white py-3 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors"
                        >
                            View Order Details
                        </button>
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="w-full border-2 border-gray-300 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                        >
                            Return to Dashboard
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-red-200">
                    <XCircle size={64} className="text-red-600 mx-auto mb-6" />
                    <h2 className="text-3xl font-bold mb-4 text-red-700">Payment Failed</h2>
                    <p className="text-gray-600 mb-6">
                        Your payment could not be processed. Please try again.
                    </p>
                    <div className="space-y-3">
                        <button
                            onClick={handleProceedToPayment}
                            className="w-full bg-[#273e8e] text-white py-3 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors"
                        >
                            Try Again
                        </button>
                        <button
                            onClick={() => setStep(5)}
                            className="w-full border-2 border-gray-300 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                        >
                            Back to Invoice
                        </button>
                    </div>
                </div>
            )}
        </div>
        );
    };

    // Calculate total price for floating cart
    const cartTotalPrice = useMemo(() => {
        if (formData.optionType !== 'build-system' || step !== 3.75 || selectedMaterials.length === 0) {
            return 0;
        }
        return selectedMaterials.reduce((sum, selMat) => {
            const material = allMaterialsMap[selMat.material_id] || categoryMaterials.find(m => m.id === selMat.material_id);
            if (!material) return sum;
            const rawPrice = Number(material.selling_rate || material.rate || 0);
            const displayPrice = rawPrice === 0 ? 1000 : rawPrice;
            return sum + (displayPrice * selMat.quantity);
        }, 0);
    }, [formData.optionType, step, selectedMaterials, allMaterialsMap, categoryMaterials]);

    const renderBuyNowProgressBar = () => (
        <div className="mb-12 max-w-xl mx-auto">
            <div className="flex justify-between text-sm font-medium text-gray-400 mb-2">
                <span className={step >= 1 ? "text-[#273e8e]" : ""}>Type</span>
                <span className={step >= 2 ? "text-[#273e8e]" : ""}>Product</span>
                <span className={step >= 3 && step < 4 ? "text-[#273e8e]" : ""}>Option</span>
                <span className={step === 7 ? "text-[#273e8e]" : ""}>Summary</span>
                <span className={step === 7.5 ? "text-[#273e8e]" : ""}>Checkout</span>
                <span className={step === 5 ? "text-[#273e8e]" : ""}>Payment</span>
                <span className={step === 6 ? "text-[#273e8e]" : ""}>Complete</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className="h-full bg-[#273e8e] transition-all duration-500 ease-out"
                    style={{
                        width: `${(() => {
                            if (step === 1) return 14;
                            if (step >= 2 && step < 3) return 28;
                            if (step >= 3 && step < 4) return 42;
                            if (step === 4) return 50;
                            if (step === 7) return 64;
                            if (step === 7.5) return 78;
                            if (step === 5) return 90;
                            if (step === 6) return 100;
                            return 0;
                        })()}%`,
                    }}
                />
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Navbar Placeholder */}
            <div className="bg-white shadow-sm p-4 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="font-bold text-xl text-[#273e8e]">Troosolar</div>
                    <button onClick={() => navigate('/')} className="text-gray-600 hover:text-[#273e8e]">
                        Exit Application
                    </button>
                </div>
            </div>

            {step === 2 ? (
                <div className="animate-fade-in flex-1 w-full px-6 py-6 overflow-y-auto">
                    <div className="w-full max-w-6xl mx-auto">
                        {renderBuyNowProgressBar()}
                        {renderStep2()}
                    </div>
                </div>
            ) : (
            /* Main Content */
            <div className="flex-grow flex items-center justify-center p-6">
                <div className="w-full max-w-6xl">
                    {renderBuyNowProgressBar()}

                    {step === 1 && renderStep1()}
                    {step === 2.5 && renderStep2_5()}
                    {step === 2.75 && renderStep2_75()}
                    {step === 3 && renderStep3()}
                    {step === 3.5 && renderStep3_5()}
                    {step === 3.6 && renderStep3_6()}
                    {step === 3.75 && renderStep3_75()}
                    {step === 4 && renderStep4()}
                    {step === 7 && renderStep7()}
                    {step === 7.5 && renderStep7_5()}
                    {step === 8 && renderStep8()}
                    {step === 5 && renderStep5()}
                    {step === 6 && renderStep6()}
                </div>
            </div>
            )}

            {/* Floating Cart - Only show during material selection (build-system) */}
            {formData.optionType === 'build-system' && step === 3.75 && selectedMaterials.length > 0 && (
                    <div className="fixed right-6 top-24 z-40 w-80 bg-white rounded-2xl shadow-2xl border-2 border-[#273e8e] max-h-[calc(100vh-8rem)] hidden xl:flex flex-col">
                        {/* Cart Header */}
                        <div className="bg-[#273e8e] text-white px-4 py-3 rounded-t-2xl flex items-center justify-between">
                            <h3 className="font-bold text-lg">Selected Materials</h3>
                            <span className="bg-white text-[#273e8e] rounded-full px-3 py-1 text-sm font-semibold">
                                {selectedMaterials.length}
                            </span>
                        </div>

                        {/* Cart Items */}
                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="space-y-3">
                                {selectedMaterials.map((selMat) => {
                                    const material = allMaterialsMap[selMat.material_id] || categoryMaterials.find(m => m.id === selMat.material_id);
                                    if (!material) return null;
                                    const rawPrice = Number(material.selling_rate || material.rate || 0);
                                    const displayPrice = rawPrice === 0 ? 1000 : rawPrice;
                                    const itemTotal = displayPrice * selMat.quantity;
                                    const materialImage = material.featured_image_url 
                                        ? toAbsolute(material.featured_image_url)
                                        : material.featured_image 
                                        ? toAbsolute(material.featured_image)
                                        : (material.images && material.images[0] && material.images[0].image)
                                        ? toAbsolute(material.images[0].image)
                                        : FALLBACK_IMAGE;

                                    return (
                                        <div key={selMat.material_id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                                                <img
                                                    src={materialImage}
                                                    alt={material.name || `Material #${selMat.material_id}`}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        if (e.target.src && !e.target.src.includes(FALLBACK_IMAGE)) {
                                                            e.target.src = FALLBACK_IMAGE;
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-semibold text-sm text-gray-800 truncate">
                                                    {material.name || `Material #${selMat.material_id}`}
                                                </h4>
                                                <div className="flex items-center justify-between mt-1">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                updateMaterialQuantity(selMat.material_id, selMat.quantity - 1);
                                                            }}
                                                            className="bg-[#273e8e] text-white rounded p-1 hover:bg-[#1a2b6b] transition-colors"
                                                        >
                                                            <Minus size={12} />
                                                        </button>
                                                        <span className="text-sm font-medium text-gray-700 w-8 text-center">
                                                            {selMat.quantity}
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                updateMaterialQuantity(selMat.material_id, selMat.quantity + 1);
                                                            }}
                                                            className="bg-[#273e8e] text-white rounded p-1 hover:bg-[#1a2b6b] transition-colors"
                                                        >
                                                            <Plus size={12} />
                                                        </button>
                                                    </div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleMaterialSelect(material);
                                                        }}
                                                        className="text-red-600 hover:text-red-700 p-1"
                                                        title="Remove"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                                <div className="mt-1 flex items-center justify-between">
                                                    <span className="text-xs text-gray-500">
                                                        {formatPrice(displayPrice)} {material.unit ? `/${material.unit}` : ''}
                                                    </span>
                                                    <span className="font-bold text-sm text-[#273e8e]">
                                                        {formatPrice(itemTotal)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Cart Footer with Total */}
                        <div className="border-t border-gray-200 p-4 bg-gray-50 rounded-b-2xl">
                            <div className="flex items-center justify-between mb-3">
                                <span className="font-semibold text-gray-700">Total:</span>
                                <span className="text-2xl font-bold text-[#273e8e]">
                                    {formatPrice(cartTotalPrice)}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    calculateCustomBundle();
                                }}
                                disabled={loading}
                                className="w-full bg-[#273e8e] text-white py-3 rounded-lg font-semibold hover:bg-[#1a2b6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader className="animate-spin" size={20} />
                                        Calculating...
                                    </>
                                ) : (
                                    <>
                                        Calculate Bundle Price
                                        <ArrowRight size={20} />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
            )}

            {showBundleSelectPrompt && (
                <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
                        <h3 className="text-xl font-bold text-[#273e8e] mb-2">Bundle Selected</h3>
                        <p className="text-sm text-gray-600 mb-6">
                            <span className="font-semibold text-gray-800">{lastSelectedBundleName}</span> has been added. Do you want to keep browsing or proceed with your selected bundle?
                        </p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => setShowBundleSelectPrompt(false)}
                                className="w-full py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
                            >
                                Keep Browsing
                            </button>
                            <button
                                onClick={() => {
                                    setShowBundleSelectPrompt(false);
                                    setStep(4);
                                }}
                                className="w-full py-3 rounded-xl bg-[#273e8e] text-white font-semibold hover:bg-[#1a2b6b] transition-colors"
                            >
                                Proceed with Selected Bundle
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default BuyNowFlow;
