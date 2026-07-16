import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Home, Building2, Factory, ArrowRight, ArrowLeft, Zap, Wrench, FileText, CheckCircle, Battery, Upload, CreditCard, Camera, Clock, Download, AlertCircle, Calendar, Loader, CheckCircle2, XCircle, X, Minus, Plus, Info, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import LoanCalculator from '../../Component/LoanCalculator';
import AuditPreferredScheduleFields from '../../Component/AuditPreferredScheduleFields';
import axios from 'axios';
import API, { BASE_URL, FLUTTERWAVE_PUBLIC_KEY } from '../../config/api.config';
import {
    fetchUserMonoAccount,
    linkMonoAccountFromCode,
    openMonoConnectWidget,
} from '../../utils/monoConnect';
import { loginPathWithReturn } from '../../utils/authRedirect';
import { persistSessionFromCartAccess } from '../../utils/cartAccessAuth';
import ProductPromoBadges from '../../Component/ProductPromoBadges';
import GridPagination from '../../Component/GridPagination';
import ProductCategoryGrid from '../../Component/ProductCategoryGrid';
import { filterBillableInvoiceFees } from '../../utils/invoiceFees';
import { resolveFlowDeliveryFee } from '../../utils/categoryDeliveryFees';
import { filterBundleCustomServicesByFlow, BUNDLE_CHECKOUT_FLOWS } from '../../utils/bundleOrderListFlow';
import {
    extractKvaFromBundle,
    sortBundlesByKvaAsc,
    sortBundlesFeaturedThenKvaAsc,
    sortCategoryProducts,
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

// Fallback image URL
const FALLBACK_IMAGE = "https://api.troosolar.com/storage/products/d5c7f116-57ed-46ef-a659-337c94c308a9.png";
const FEE_VIS_TROO_PREFIX = "[FEE:TROOSOLAR]";
const FEE_VIS_OWN_PREFIX = "[FEE:OWN]";
const FEE_VIS_BOTH_PREFIX = "[FEE]";
const SOCIAL_HANDLE_REGEX = /^@[A-Za-z0-9._]{3,30}$/;
const SOCIAL_PROFILE_URL_REGEX = /^https?:\/\/(www\.)?(instagram\.com|facebook\.com)\/[A-Za-z0-9._-]{3,}\/?$/i;

const isValidSocialMediaIdentity = (value) => {
    const v = String(value || '').trim();
    if (!v) return false;
    return SOCIAL_HANDLE_REGEX.test(v) || SOCIAL_PROFILE_URL_REGEX.test(v);
};

const getSocialMediaVerificationUrl = (value) => {
    const v = String(value || '').trim();
    if (!v) return '';
    if (SOCIAL_PROFILE_URL_REGEX.test(v)) return v;
    if (SOCIAL_HANDLE_REGEX.test(v)) return `https://www.instagram.com/${v.slice(1)}`;
    return '';
};

// Insurance: default 3% of order when not set in backend. Backend can override via add-ons (is_compulsory_bnpl, calculation_type: 'percentage', calculation_value).
const DEFAULT_INSURANCE_PERCENT = 3;
// Credit check fee: editable from backend via loan-config (credit_check_fee). Fallback when not set.
const DEFAULT_CREDIT_CHECK_FEE = 1000;

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
    
    if (bundle.featured_image) {
        return toAbsolute(bundle.featured_image);
    }
    // Return fallback image
    return FALLBACK_IMAGE;
};

// Helper to format price (moved to component level for modal access)
const formatPrice = (price) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(price);
};

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

// Flutterwave integration
const ensureFlutterwave = () =>
    new Promise((resolve, reject) => {
        if (window.FlutterwaveCheckout) return resolve();
        const s = document.createElement("script");
        s.src = "https://checkout.flutterwave.com/v3.js";
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load payment gateway"));
        document.body.appendChild(s);
    });

const dismissFlutterwaveOverlay = () => {
    if (typeof window.closePaymentModal === 'function') {
        window.closePaymentModal();
    }
    document.querySelectorAll('iframe[src*="flutterwave"], iframe[src*="flw"]').forEach((el) => {
        const parent = el.closest('div');
        if (parent && parent !== document.body) {
            parent.style.display = 'none';
        }
    });
};

const BNPLFlow = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [customerTypes, setCustomerTypes] = useState([]);
    const [auditTypes, setAuditTypes] = useState([]);
    const [loanConfig, setLoanConfig] = useState(null);
    const [addOns, setAddOns] = useState([]);
    const [states, setStates] = useState([]);
    const [checkoutSettings, setCheckoutSettings] = useState(null);
    const [loading, setLoading] = useState(false);
    const [applicationId, setApplicationId] = useState(null);
    const [applicationStatus, setApplicationStatus] = useState('pending');
    const [checkingAuditStatus, setCheckingAuditStatus] = useState(false);
    const [guarantorId, setGuarantorId] = useState(null);
    const [invoiceData, setInvoiceData] = useState(null);
    const [processingPayment, setProcessingPayment] = useState(false);
    const [paymentResult, setPaymentResult] = useState(null); // 'success' | 'failed' | null
    const [showCreditCheckFeeModal, setShowCreditCheckFeeModal] = useState(false);
    const [processingCreditCheckPayment, setProcessingCreditCheckPayment] = useState(false);
    /** choose_method → mono_link (auto) → pay_fee → manual_upload (manual) | processing (auto after fee) */
    const [creditCheckPhase, setCreditCheckPhase] = useState('choose_method');
    const [creditCheckFeePaid, setCreditCheckFeePaid] = useState(false);
    const [monoFeePaymentReference, setMonoFeePaymentReference] = useState(null);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [monoConnectInstance, setMonoConnectInstance] = useState(null);
    const [monoFailed, setMonoFailed] = useState(false); // Track if Mono has failed
    const [monoCreditSessionId, setMonoCreditSessionId] = useState(null);
    const [userMonoAccount, setUserMonoAccount] = useState({ linked: false });
    const [loadingUserMonoAccount, setLoadingUserMonoAccount] = useState(false);
    const [auditOrderId, setAuditOrderId] = useState(null);
    const [auditCalendarSlots, setAuditCalendarSlots] = useState([]);
    const [selectedAuditSlot, setSelectedAuditSlot] = useState(null);
    
    // Custom order flow (from admin-created cart)
    const [searchParams] = useSearchParams();
    /** Re-apply from BNPL loan details: credit check fee waived; prior_application_id sent on submit */
    const [reapplyPriorApplicationId, setReapplyPriorApplicationId] = useState(() => {
        try {
            const s = sessionStorage.getItem('bnpl_reapply_prior_application_id');
            return s ? parseInt(s, 10) : null;
        } catch {
            return null;
        }
    });
    const [skipCreditCheckFee, setSkipCreditCheckFee] = useState(() => {
        try {
            return sessionStorage.getItem('bnpl_skip_credit_check_fee') === '1';
        } catch {
            return false;
        }
    });
    const [bnplTermsAccepted, setBnplTermsAccepted] = useState(() => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('bnpl_terms_accepted') === 'true');
    const [bnplTermsCheckbox, setBnplTermsCheckbox] = useState(false);
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
        auditSubtype: '', // 'home' | 'office' when auditType is home-office
        companyName: '',
        facilityDescription: '',
        buildingType: '',
        commercialAddress: '',
        officeAddress: '',
        officeSpaces: '',
        address: '',
        state: '',
        stateId: null,
        houseNo: '',
        landmark: '',
        floors: '',
        rooms: '',
        selectedProductPrice: 0,
        selectedBundleId: null, // OLD: Single bundle ID (kept for backward compatibility)
        selectedBundle: null, // OLD: Single bundle object (kept for backward compatibility)
        selectedProductId: null, // OLD: Single product ID (kept for backward compatibility)
        selectedProduct: null, // OLD: Single product object (kept for backward compatibility)
        selectedBundles: [], // NEW: Array of selected bundles [{id, bundle, price}, ...]
        selectedProducts: [], // NEW: Array of selected products [{id, product, price}, ...]
        loanDetails: null,
        creditCheckMethod: '', // 'auto', 'manual'
        creditScore: null, // Credit score from Mono (0-100)
        creditReport: null, // Full credit report from Mono
        bvn: '',
        fullName: '',
        email: '',
        phone: '',
        socialMedia: '',
        isGatedEstate: false,
        estateName: '',
        estateAddress: '',
        preferredAuditDate: '',
        preferredAuditTime: '',
        bankStatement: null,
        livePhoto: null,
        livePhotoPreview: null,
        auditRequestId: null, // Store audit request ID after submission
        streetName: '', // Street name for property address
    });

    // Camera capture for live photo
    const [cameraStream, setCameraStream] = useState(null);
    const [cameraError, setCameraError] = useState(null);
    const cameraVideoRef = useRef(null);
    const cameraCanvasRef = useRef(null);

    const openCamera = async () => {
        setCameraError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false,
            });
            setCameraStream(stream);
            // Attach stream to video element after render
            setTimeout(() => {
                if (cameraVideoRef.current) {
                    cameraVideoRef.current.srcObject = stream;
                }
            }, 100);
        } catch (err) {
            console.error('Camera access error:', err);
            if (err.name === 'NotAllowedError') {
                setCameraError('Camera access was denied. Please allow camera permission in your browser settings and try again.');
            } else if (err.name === 'NotFoundError') {
                setCameraError('No camera found on this device.');
            } else {
                setCameraError('Could not access camera. Please try again or use a device with a camera.');
            }
        }
    };

    const stopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
    };

    const captureLivePhoto = () => {
        const video = cameraVideoRef.current;
        const canvas = cameraCanvasRef.current;
        if (!video || !canvas) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], `live-selfie-${Date.now()}.jpg`, { type: 'image/jpeg' });
                const previewUrl = canvas.toDataURL('image/jpeg');
                setFormData(prev => ({ ...prev, livePhoto: file, livePhotoPreview: previewUrl }));
                stopCamera();
            }
        }, 'image/jpeg', 0.9);
    };

    // Cleanup camera stream on unmount
    useEffect(() => {
        return () => {
            if (cameraStream) {
                cameraStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [cameraStream]);

    // Categories and products for individual components
    const [categories, setCategories] = useState([]);
    const [categoryProducts, setCategoryProducts] = useState([]);
    const [productsLoading, setProductsLoading] = useState(false);
    const [selectedCategoryId, setSelectedCategoryId] = useState(null);

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
    const bundlesFetchedForLoadRef = useRef(false);
    const bundlesNeedRefreshRef = useRef(false);
    const bundlesSnapshotRef = useRef([]);
    const [enrichedBundles, setEnrichedBundles] = useState({}); // { bundleId: fullBundleData }
    const [enrichingBundles, setEnrichingBundles] = useState(false);

    // Defensive guard: never remain on step 3.6 without details data.
    useEffect(() => {
        if (step === 3.6 && !selectedBundleDetails) {
            setStep(3.5);
        }
    }, [step, selectedBundleDetails]);

    // Fetch full details (bundle_items, materials, services) for all selected bundles
    const enrichSelectedBundles = async () => {
        const token = localStorage.getItem('access_token');
        // Always re-fetch full details to get the latest custom_services / [OL] items
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
            const newEnriched = { ...enrichedBundles };
            results.forEach(r => { if (r.detail) newEnriched[r.id] = r.detail; });
            setEnrichedBundles(newEnriched);
            // Also update the bundle objects in formData so extractBundleLineItems works
            setFormData(prev => ({
                ...prev,
                selectedBundles: prev.selectedBundles.map(sb => {
                    const full = newEnriched[sb.id];
                    if (full) return { ...sb, bundle: { ...sb.bundle, ...full } };
                    return sb;
                }),
            }));
        } finally {
            setEnrichingBundles(false);
        }
    };

    // Map predefined category groups to API category IDs
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

    const parseAmount = (value) => {
        if (value == null || value === '') return 0;
        const cleaned = String(value).replace(/,/g, '').replace(/[^\d.-]/g, '');
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : 0;
    };

    const bnplMinimumLoanAmount = useMemo(() => {
        const configured = parseAmount(loanConfig?.minimum_loan_amount);
        return configured > 0 ? configured : 0;
    }, [loanConfig]);

    const bundlesMeetingMinLoan = useMemo(() => {
        if (bnplMinimumLoanAmount <= 0) return bundles;
        return bundles.filter((bundle) => {
            const bundlePrice = Number(bundle?.discount_price || bundle?.total_price || 0);
            return bundlePrice >= bnplMinimumLoanAmount;
        });
    }, [bundles, bnplMinimumLoanAmount]);

    // System size options derived from actual bundles (only sizes we have)
    const sizeOptions = useMemo(() => {
        const sizeSet = new Set();
        bundlesMeetingMinLoan.forEach((bundle) => {
            const size = extractKvaFromBundle(bundle);
            if (size > 0 && Number.isFinite(size)) {
                // Round to 1 decimal place to normalize
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
    }, [bundlesMeetingMinLoan]);

    // Filter by size, then ascending kVA (smallest → largest).
    const filteredBundles = useMemo(() => {
        const sourceBundles = bundlesMeetingMinLoan;
        let list;
        if (selectedSystemSize === "all") {
            list = sourceBundles;
        } else {
            const targetSize = parseFloat(selectedSystemSize);
            if (isNaN(targetSize)) {
                list = sourceBundles;
            } else {
                list = sourceBundles.filter((bundle) => {
                    const bundleSize = extractKvaFromBundle(bundle);
                    if (bundleSize <= 0) return false;
                    const tolerance = 0.3;
                    return Math.abs(bundleSize - targetSize) <= tolerance;
                });
            }
        }
        return sortBundlesFeaturedThenKvaAsc(list);
    }, [bundlesMeetingMinLoan, selectedSystemSize]);

    useEffect(() => {
        setBundleGridPage(1);
    }, [selectedSystemSize, bundles, bnplMinimumLoanAmount]);

    useEffect(() => {
        const total = Math.max(1, Math.ceil(filteredBundles.length / BUNDLE_STEP_GRID_PAGE_SIZE));
        setBundleGridPage((p) => (p > total ? total : p));
    }, [filteredBundles.length]);

    const orderedCategoryProducts = useMemo(
        () => sortCategoryProducts(categoryProducts, formData.productCategory),
        [categoryProducts, formData.productCategory]
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

    // --- Effects ---
    
    // Default credit check method when step 10 is reached
    React.useEffect(() => {
        if (step === 10 && !formData.creditCheckMethod) {
            setFormData(prev => ({ ...prev, creditCheckMethod: 'auto' }));
        }
    }, [step]);

    React.useEffect(() => {
        if (step !== 10) return;
        setCreditCheckPhase('choose_method');
        setCreditCheckFeePaid(false);
        setMonoFeePaymentReference(null);
        setShowCreditCheckFeeModal(false);
        setAcceptedTerms(false);
    }, [step]);

    React.useEffect(() => {
        if (step !== 10) return;
        let cancelled = false;
        const loadLinkedAccount = async () => {
            setLoadingUserMonoAccount(true);
            try {
                const data = await fetchUserMonoAccount();
                if (!cancelled) setUserMonoAccount(data);
            } catch {
                if (!cancelled) setUserMonoAccount({ linked: false });
            } finally {
                if (!cancelled) setLoadingUserMonoAccount(false);
            }
        };
        loadLinkedAccount();
        return () => { cancelled = true; };
    }, [step]);

    
    // Check for custom order flow (cart token) or existing application on mount
    React.useEffect(() => {
        const token = searchParams.get('token');
        const type = searchParams.get('type');
        const applicationIdParam = searchParams.get('applicationId');
        const reapplyParam = searchParams.get('reapply');
        const priorApplicationIdParam = searchParams.get('priorApplicationId');
        const skipCreditCheckFeeParam = searchParams.get('skipCreditCheckFee');
        const bundleIdParam = searchParams.get('bundleId');
        const stepParam = searchParams.get('step');
        const fromBundle = searchParams.get('fromBundle') === 'true';
        
        if (token && (type === 'buy_now' || type === 'bnpl')) {
            setCartToken(token);
            setCartOrderType(type);
            verifyCartAccess(token, type);
        }
        
        // If applicationId is provided, load existing application; optional stepParam (e.g. 17) jumps to that step
        if (applicationIdParam) {
            loadExistingApplication(Number(applicationIdParam)).then(() => {
                if (stepParam) setStep(Number(stepParam));
            });
        }

        if (reapplyParam === '1' && priorApplicationIdParam) {
            const pid = Number(priorApplicationIdParam);
            if (Number.isFinite(pid) && pid > 0) {
                setReapplyPriorApplicationId(pid);
                setSkipCreditCheckFee(skipCreditCheckFeeParam === '1');
                try {
                    sessionStorage.setItem('bnpl_reapply_prior_application_id', String(pid));
                    sessionStorage.setItem('bnpl_skip_credit_check_fee', skipCreditCheckFeeParam === '1' ? '1' : '0');
                } catch {}
            }
        }
        
        // If coming from bundle detail page, load bundle and skip to order summary
        if (bundleIdParam && fromBundle) {
            loadBundleAndSkipToStep(Number(bundleIdParam), stepParam ? Number(stepParam) : 6.5);
            return;
        }
        // When coming from Load Calculator with step=3.5 and q, go to bundle selection with load-based bundles; preserve category from URL
        const qParam = searchParams.get('q');
        const categoryParam = searchParams.get('category');
        if (stepParam && Number(stepParam) === 3.5) {
            setStep(3.5);
            if (qParam || categoryParam) {
                const resolvedCategory = categoryParam && ['full-kit', 'inverter-battery', 'battery-only'].includes(categoryParam)
                    ? categoryParam
                    : (undefined);
                setFormData(prev => ({
                    ...prev,
                    optionType: prev.optionType || 'choose-system',
                    productCategory: resolvedCategory ?? prev.productCategory ?? 'full-kit',
                    customerType: prev.customerType || 'residential',
                }));
            }
        }
    }, [searchParams]);
    
    // Load bundle and skip to order summary step (use BUNDLE_DETAILS for full data including price)
    const loadBundleAndSkipToStep = async (bundleId, targetStep) => {
        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const response = await axios.get(API.BUNDLE_DETAILS(bundleId), {
                headers: {
                    Accept: 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });
            const bundle = response.data?.data ?? response.data?.data ?? response.data;
            if (bundle) {
                const price = Number(bundle.discount_price || bundle.total_price || 0);
                
                // Set bundle in formData (with default quantity of 1)
                setFormData(prev => ({
                    ...prev,
                    selectedBundles: [{
                        id: bundle.id,
                        bundle: bundle,
                        price: price,
                        quantity: 1
                    }],
                    selectedBundleId: bundle.id,
                    selectedBundle: bundle,
                    selectedProductPrice: price,
                    optionType: 'choose-system', // Assume choose-system when coming from bundle
                    productCategory: 'full-kit', // Default category
                    customerType: prev.customerType || 'residential' // Set default customer type if not already set
                }));
                
                // Skip to the target step (Order Summary)
                setStep(targetStep);
            }
        } catch (error) {
            console.error('Failed to load bundle:', error);
            alert('Failed to load bundle. Please try again.');
        } finally {
            setLoading(false);
        }
    };
    
    // Load existing application data
    const loadExistingApplication = async (appId) => {
        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                alert("Please login to continue");
                navigate(loginPathWithReturn(`/bnpl?applicationId=${appId}`));
                return;
            }
            
            const response = await axios.get(API.BNPL_STATUS(appId), {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json'
                }
            });
            
            if (response.data.status === 'success' && response.data.data) {
                const app = response.data.data;
                
                // Set application ID
                setApplicationId(app.id);
                setApplicationStatus(app.status);
                
                // Populate form data from application
                setFormData(prev => ({
                    ...prev,
                    customerType: app.customer_type || prev.customerType,
                    productCategory: app.product_category || prev.productCategory,
                    state: app.property_state || prev.state,
                    address: app.property_address || prev.address,
                    houseNo: app.property_house_no || prev.houseNo,
                    streetName: app.property_street_name || prev.streetName,
                    landmark: app.property_landmark || prev.landmark,
                    floors: app.property_floors || prev.floors,
                    rooms: app.property_rooms || prev.rooms,
                    isGatedEstate: app.is_gated_estate || prev.isGatedEstate,
                    estateName: app.estate_name || prev.estateName,
                    estateAddress: app.estate_address || prev.estateAddress,
                    creditCheckMethod: app.credit_check_method || prev.creditCheckMethod,
                    fullName: app.full_name || prev.fullName,
                    email: app.email || prev.email,
                    phone: app.phone || prev.phone,
                    socialMedia: app.social_media_handle || prev.socialMedia,
                    selectedProductPrice: parseFloat((app.loan_amount || '0').replace(/,/g, '')) || prev.selectedProductPrice,
                    auditRequestId: app.audit_request_id || prev.auditRequestId
                }));
                
                // Set loan details if available
                if (app.loan_calculation) {
                    setFormData(prev => ({
                        ...prev,
                        loanDetails: {
                            depositAmount: parseFloat((app.loan_calculation.down_payment || '0').replace(/,/g, '')),
                            principal: parseFloat((app.loan_calculation.loan_amount || '0').replace(/,/g, '')),
                            totalInterest: parseFloat((app.loan_calculation.total_amount || '0').replace(/,/g, '')) - parseFloat((app.loan_calculation.loan_amount || '0').replace(/,/g, '')),
                            monthlyRepayment: parseFloat((app.loan_calculation.monthly_repayment || '0').replace(/,/g, '')),
                            totalRepayment: parseFloat((app.loan_calculation.total_amount || '0').replace(/,/g, '')),
                            duration: app.repayment_duration || 12,
                            interestRate: app.loan_calculation.interest_rate || 4.0
                        }
                    }));
                }
                
                // If approved, go directly to summary/invoice/payment flow
                if (app.status === 'approved') {
                    // Navigate to invoice (step 21) which shows summary, invoice, and upfront payment
                    setStep(21);
                } else {
                    // For other statuses, show application status
                    setStep(12);
                }
            } else {
                alert('Application not found');
                navigate('/bnpl-credit-check');
            }
        } catch (error) {
            console.error('Error loading application:', error);
            alert(error.response?.data?.message || 'Failed to load application');
            navigate('/bnpl-credit-check');
        } finally {
            setLoading(false);
        }
    };

    // Verify cart access and load cart items
    const verifyCartAccess = async (token, orderType = 'bnpl') => {
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

                // Legacy API fallback when auto-login is unavailable
                if (cartData.requires_login) {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('user');
                    const returnUrl = `/cart?token=${encodeURIComponent(token)}&type=${encodeURIComponent(orderType)}`;
                    navigate(loginPathWithReturn(returnUrl));
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
                        const totalPrice = [...products, ...bundles].reduce(
                            (sum, item) => sum + item.price * (item.quantity || 1),
                            0
                        );
                        setFormData(prev => ({
                            ...prev,
                            selectedProducts: products,
                            selectedBundles: bundles,
                            selectedProductPrice: totalPrice,
                            customerType: prev.customerType || 'residential',
                            optionType: 'choose-system',
                            productCategory: prev.productCategory || 'full-kit',
                        }));
                        if (orderType === 'bnpl') {
                            setStep(6.5);
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

    /** Shop cart "Buy By Loan" → open BNPL invoice (6.75), then user proceeds to loan calculator (8). */
    React.useEffect(() => {
        if (searchParams.get('fromCart') !== '1') return;
        const token = localStorage.getItem('access_token');
        if (!token) {
            navigate('/login?return=' + encodeURIComponent('/bnpl?fromCart=1&step=6.75'));
            return;
        }
        const rawStep = searchParams.get('step');
        const parsed = rawStep != null && rawStep !== '' ? parseFloat(rawStep) : 6.75;
        const stepToUse = Number.isFinite(parsed) ? parsed : 6.75;

        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const response = await axios.get(API.CART, {
                    headers: {
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                });
                if (cancelled) return;
                const list = Array.isArray(response.data?.data) ? response.data.data : [];
                if (list.length === 0) {
                    alert('Your cart is empty. Add items before applying for BNPL.');
                    navigate('/cart');
                    return;
                }
                const products = [];
                const bundles = [];
                let total = 0;
                list.forEach((item) => {
                    const itemable = item.itemable;
                    const qty = Math.max(1, Number(item.quantity || 1));
                    const sub = Number(item.subtotal) || 0;
                    const unit = Number(item.unit_price) || 0;
                    const lineTotal = sub > 0 ? sub : unit * qty;
                    const unitPrice = sub > 0 ? sub / qty : unit;
                    if (item.type === 'product' && itemable) {
                        products.push({
                            id: item.itemable_id,
                            product: itemable,
                            price: unitPrice,
                            quantity: qty,
                        });
                        total += lineTotal;
                    } else if (item.type === 'bundle' && itemable) {
                        bundles.push({
                            id: item.itemable_id,
                            bundle: itemable,
                            price: unitPrice,
                            quantity: qty,
                        });
                        total += lineTotal;
                    }
                });
                if (products.length === 0 && bundles.length === 0) {
                    alert('Could not read your cart items. Please try again.');
                    navigate('/cart');
                    return;
                }
                setFormData((prev) => ({
                    ...prev,
                    optionType: 'choose-system',
                    productCategory: prev.productCategory || 'full-kit',
                    customerType: prev.customerType || 'residential',
                    selectedProducts: products,
                    selectedBundles: bundles,
                    selectedProductPrice: total,
                }));
                setStep(stepToUse);
            } catch (e) {
                if (!cancelled) {
                    console.error(e);
                    alert(e?.response?.data?.message || 'Failed to load cart for BNPL.');
                    navigate('/cart');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [searchParams, navigate]);

    React.useEffect(() => {
        const fetchConfig = async () => {
            try {
                const [custRes, auditRes, loanConfigRes, addOnsRes, statesRes, categoriesRes, checkoutRes] = await Promise.all([
                    axios.get(API.CONFIG_CUSTOMER_TYPES).catch(() => ({ data: { status: 'error' }, status: 404 })),
                    axios.get(API.CONFIG_AUDIT_TYPES).catch(() => ({ data: { status: 'error' }, status: 404 })),
                    axios.get(API.CONFIG_LOAN_CONFIGURATION).catch(() => ({ data: { status: 'error' }, status: 404 })),
                    axios.get(API.CONFIG_ADD_ONS, { params: { type: 'bnpl' } }).catch(() => ({ data: { status: 'error' }, status: 404 })),
                    axios.get(API.CONFIG_STATES).catch(() => ({ data: { status: 'error' }, status: 404 })),
                    axios.get(API.CATEGORIES, {
                        headers: {
                            Accept: 'application/json',
                            ...(localStorage.getItem('access_token') ? { Authorization: `Bearer ${localStorage.getItem('access_token')}` } : {}),
                        },
                    }).catch(() => ({ data: { status: 'error' }, status: 404 })),
                    axios.get(API.CONFIG_CHECKOUT_SETTINGS).catch(() => ({ data: { status: 'error' }, status: 404 })),
                ]);
                
                // Only set data if API call was successful (not 404)
                if (custRes.status !== 404 && custRes.data?.status === 'success') {
                    setCustomerTypes(custRes.data.data);
                }
                if (auditRes.status !== 404 && auditRes.data?.status === 'success') {
                    setAuditTypes(auditRes.data.data);
                }
                if (loanConfigRes.status !== 404 && loanConfigRes.data?.status === 'success') {
                    setLoanConfig(loanConfigRes.data.data);
                }
                if (addOnsRes.status !== 404 && addOnsRes.data?.status === 'success') {
                    setAddOns(addOnsRes.data.data || []);
                }
                if (statesRes.status !== 404 && statesRes.data?.status === 'success') {
                    setStates(statesRes.data.data || []);
                }
                if (categoriesRes.status !== 404 && categoriesRes.data?.data) {
                    setCategories(Array.isArray(categoriesRes.data.data) ? categoriesRes.data.data : []);
                }
                if (checkoutRes.status !== 404 && checkoutRes.data?.status === 'success') {
                    setCheckoutSettings(checkoutRes.data.data || null);
                }
            } catch (error) {
                // Silently fail - APIs may not be implemented yet
                console.log("Configuration APIs not available yet:", error.message);
            }
            
            // Fallback to defaults if APIs fail or return 404
            if (customerTypes.length === 0) {
                setCustomerTypes([
                    { id: 'residential', label: 'For Residential' },
                    { id: 'sme', label: 'For SMEs' },
                    { id: 'commercial', label: 'Commercial & Industrial' }
                ]);
            }
            if (auditTypes.length === 0) {
                setAuditTypes([
                    { id: 'home-office', label: 'Home / Office' },
                    { id: 'commercial', label: 'Commercial / Industrial' }
                ]);
            }
        };
        fetchConfig();
    }, []);

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
            // "solar inverter battery" contains the substring "inverter battery", so full kits were incorrectly
            // included in inverter-battery. Exclude full-kit matches first for that flow only.
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
            bundlesFetchedForLoadRef.current = true;
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

    // When on bundle selection (step 3.5), load bundles if the list is empty (e.g. after navigating back).
    React.useEffect(() => {
        if (step !== 3.5) {
            bundlesFetchedForLoadRef.current = false;
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
        if (hasLoadParam && bundlesFetchedForLoadRef.current && !bundlesNeedRefreshRef.current) {
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

    // Enrich selected bundles with full detail data when entering order summary
    React.useEffect(() => {
        if (step === 6.5 && formData.selectedBundles.length > 0) {
            enrichSelectedBundles();
        }
    }, [step]);

    // --- Handlers ---

    const handleCustomerTypeSelect = (type) => {
        if (type === 'commercial') {
            setFormData((prev) => ({
                ...prev,
                customerType: 'commercial',
                optionType: 'audit',
                auditType: 'commercial',
                auditSubtype: '',
                productCategory: prev.productCategory || 'full-kit',
            }));
            setStep(5); // Commercial/Industrial audit form — skip product category & method steps
            return;
        }
        setFormData((prev) => ({ ...prev, customerType: type }));
        setStep(2); // Go to Product Category
    };

    const handleCategorySelect = async (groupType) => {
        // groupType can be: 'full-kit', 'inverter-battery', 'battery-only', 'inverter-only', 'panels-only'
        setFormData({ ...formData, productCategory: groupType });

        // For full-kit and inverter-battery, go to Method Selection (Step 3)
        if (groupType === 'full-kit' || groupType === 'inverter-battery') {
            setStep(3); // Method Selection (Choose/Build/Audit)
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

    const handleOptionSelect = async (option) => {
        setFormData({ ...formData, optionType: option });
        if (option === 'audit') {
            if (formData.customerType === 'commercial') {
                setFormData({
                    ...formData,
                    optionType: 'audit',
                    auditType: 'commercial',
                    auditSubtype: '',
                });
                setStep(5);
            } else {
                setFormData({ ...formData, optionType: 'audit' });
                setStep(4); // Home vs Office only
            }
        } else if (option === 'choose-system') {
            bundlesNeedRefreshRef.current = true;
            bundlesFetchedForLoadRef.current = false;
            setFormData((prev) => ({ ...prev, optionType: option }));
            setStep(3.5);
        } else if (option === 'build-system') {
            // Fetch all products for building a custom system
            setCategoryProducts([]);
            setProductsLoading(true);
            setStep(3.75); // Navigate to Build System Product Selection step
            
            try {
                const token = localStorage.getItem('access_token');
                let allProducts = [];
                
                // Fetch products from all categories
                if (categories.length > 0) {
                    for (const category of categories) {
                        try {
                            const response = await axios.get(API.CATEGORY_PRODUCTS(category.id), {
                                headers: {
                                    Accept: 'application/json',
                                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                },
                            });
                            const root = response.data?.data ?? response.data;
                            const products = Array.isArray(root) ? root : Array.isArray(root?.data) ? root.data : [];
                            allProducts = [...allProducts, ...products];
                        } catch (err) {
                            console.warn(`Failed to fetch products for category ${category.id}:`, err);
                        }
                    }
                }
                
                // If no products found via category endpoint, try fetching all products
                if (allProducts.length === 0) {
                    try {
                        const allProductsRes = await axios.get(API.PRODUCTS, {
                            headers: {
                                Accept: 'application/json',
                                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                            },
                        });
                        const allProductsList = Array.isArray(allProductsRes.data?.data) ? allProductsRes.data.data : [];
                        allProducts = allProductsList;
                    } catch (error) {
                        console.error("Failed to fetch all products:", error);
                    }
                }
                
                setCategoryProducts(dedupeProductsById(allProducts));
            } catch (error) {
                console.error("Failed to fetch products:", error);
                alert("Failed to load products. Please try again.");
                setCategoryProducts([]);
            } finally {
                setProductsLoading(false);
            }
        }
    };

    const handleAuditTypeSelect = (subtype) => {
        setFormData({ ...formData, auditType: 'home-office', auditSubtype: subtype });
        setStep(5);
    };

    const handleAddressSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                alert("Please login to continue");
                navigate('/login');
                return;
            }

            // Submit audit request before proceeding
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
                source: 'bnpl',
                property_state: formData.state,
                property_address: fullAddress || formData.address,
                property_landmark: formData.landmark || '',
                property_floors: isCommercial ? null : (formData.floors ? Number(formData.floors) : null),
                property_rooms: isCommercial
                    ? null
                    : isOffice
                        ? (formData.officeSpaces ? Number(formData.officeSpaces) : null)
                        : (formData.rooms ? Number(formData.rooms) : null),
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

            // Always send contact info when available so admin can process commercial requests faster.
            try {
                const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
                auditRequestPayload.contact_name = formData.fullName || userInfo?.name || userInfo?.full_name || '';
                auditRequestPayload.contact_phone = formData.phone || userInfo?.phone || '';
            } catch {
                // Ignore parse errors and proceed with payload defaults.
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
                setFormData(prev => ({
                    ...prev,
                    auditRequestId,
                    address: fullAddress || prev.address
                }));
                
                // Both home/office and commercial audits now follow the same no-payment approval flow.
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

    const handleCheckAuditRequestStatus = async () => {
        const requestId = formData.auditRequestId;
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

    const handleLoanConfirm = (loanDetails) => {
        setFormData({ ...formData, loanDetails });
        setStep(9); // Customer decides to proceed (NEW STEP)
    };

    const handleBundleSelect = (bundle) => {
        const price = Number(bundle.discount_price || bundle.total_price || 0);
        const isAlreadySelected = formData.selectedBundles.some(b => b.id === bundle.id);
        setFormData(prev => {
            // Check if bundle is already selected
            const isSelected = prev.selectedBundles.some(b => b.id === bundle.id);
            
            let updatedBundles;
            if (isSelected) {
                // Remove bundle if already selected
                updatedBundles = prev.selectedBundles.filter(b => b.id !== bundle.id);
            } else {
                // Add bundle if not selected (with default quantity of 1)
                updatedBundles = [...prev.selectedBundles, {
                    id: bundle.id,
                    bundle: bundle,
                    price: price,
                    quantity: 1
                }];
            }
            
            // Calculate total price from all selected bundles and products (accounting for quantity)
            const bundlesTotal = updatedBundles.reduce((sum, b) => sum + (b.price * (b.quantity || 1)), 0);
            const productsTotal = prev.selectedProducts.reduce((sum, p) => sum + (p.price * (p.quantity || 1)), 0);
            const totalPrice = bundlesTotal + productsTotal;
            
            return {
                ...prev,
                selectedBundles: updatedBundles,
                // Keep old fields for backward compatibility (use first selected if any)
                selectedBundleId: updatedBundles.length > 0 ? updatedBundles[0].id : null,
                selectedBundle: updatedBundles.length > 0 ? updatedBundles[0].bundle : null,
                selectedProductPrice: totalPrice
            };
        });
        if (!isAlreadySelected) {
            setLastSelectedBundleName(bundle?.title || bundle?.name || 'Selected bundle');
            setShowBundleSelectPrompt(true);
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
                    price: price
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

    // --- BNPL Terms Gate (loan agreement before flow) ---
    const handleAcceptTermsAndProceed = () => {
        if (!bnplTermsCheckbox) return;
        try { sessionStorage.setItem('bnpl_terms_accepted', 'true'); } catch (e) { void e; }
        setBnplTermsAccepted(true);
    };

    const privacyPolicyUrl = 'https://troosolar.io/privacy-policy/';
    const termsOfServiceUrl = 'https://troosolar.io/terms-of-service/';

    const renderTermsGate = () => (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <div className="bg-white shadow-sm p-4 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="font-bold text-xl text-[#273e8e]">Troosolar</div>
                    <button onClick={() => navigate('/')} className="text-gray-600 hover:text-[#273e8e]">Exit</button>
                </div>
            </div>
            <div className="flex-grow flex items-center justify-center p-6">
                <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col">
                    <div className="px-6 pt-6 pb-2 flex-shrink-0">
                        <p className="text-center text-xl font-semibold text-[#273e8e]">Terms of Use Agreement</p>
                        <p className="text-gray-600 text-sm text-center mt-2">Accept the terms of service and privacy policy to continue</p>
                    </div>
                    <div className="px-6 py-4 flex-shrink-0 space-y-4">
                        <label className="flex items-start gap-3 font-medium cursor-pointer text-sm">
                            <input
                                type="checkbox"
                                checked={bnplTermsCheckbox}
                                onChange={(e) => setBnplTermsCheckbox(e.target.checked)}
                                className="h-4 w-4 mt-0.5 text-[#273e8e] focus:ring-[#273e8e] border-gray-300 rounded flex-shrink-0"
                            />
                            <span>
                                I accept the{" "}
                                <a
                                    href={termsOfServiceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#273e8e] underline hover:text-[#1d2f6b]"
                                >
                                    Terms Of Service
                                </a>
                                {" "} & {" "}
                                <a
                                    href={privacyPolicyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#273e8e] underline hover:text-[#1d2f6b]"
                                >
                                    Privacy Policy
                                </a>
                            </span>
                        </label>
                        <button
                            onClick={handleAcceptTermsAndProceed}
                            disabled={!bnplTermsCheckbox}
                            className={`w-full py-3 rounded-full font-medium transition-colors ${bnplTermsCheckbox ? 'bg-[#273e8e] text-white hover:bg-[#1d2f6b]' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                        >
                            Proceed
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    // --- Render Steps ---

    const renderStep1 = () => (
        <div className="animate-fade-in">
            <h2 className="text-3xl font-bold text-center mb-8 text-[#273e8e]">
                What are you purchasing for?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                {(customerTypes.length > 0 ? customerTypes : [
                    { id: 'residential', label: 'For Residential' },
                    { id: 'sme', label: 'For SMEs' },
                    { id: 'commercial', label: 'Commercial & Industrial' }
                ]).map((type) => (
                    <button
                        key={type.id}
                        onClick={() => handleCustomerTypeSelect(type.id)}
                        className="group bg-white border-2 border-gray-100 hover:border-[#273e8e] rounded-2xl p-8 hover:shadow-xl transition-all duration-300 flex flex-col items-center text-center"
                    >
                        <div className="bg-blue-50 p-6 rounded-full mb-6 group-hover:bg-[#273e8e]/10 transition-colors">
                            {type.id === 'residential' && <Home size={40} className="text-[#273e8e]" />}
                            {type.id === 'sme' && <Building2 size={40} className="text-[#273e8e]" />}
                            {type.id === 'commercial' && <Factory size={40} className="text-[#273e8e]" />}
                        </div>
                        <h3 className="text-xl font-bold mb-2 text-gray-800">{type.label}</h3>
                    </button>
                ))}
            </div>
        </div>
    );

    const renderStep2 = () => {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e] transition-colors"
                >
                    <ArrowLeft size={16} className="mr-2" /> Back
                </button>
                <div className="flex justify-center mb-6">
                    <span className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-bold bg-gradient-to-r from-[#273e8e] to-[#1a2b6b] text-white shadow-lg">
                        <CreditCard size={16} className="mr-2" />
                        Buy Now Pay Later
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

    const renderStep2_5 = () => {
        const formatPrice = (price) => {
            return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(price);
        };

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
                                onClick={() => setStep(6.5)}
                                className="bg-[#273e8e] text-white px-8 py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors flex items-center"
                            >
                                Continue with {formData.selectedProducts.length} {formData.selectedProducts.length !== 1 ? 'Items' : 'Item'} Selected
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
        const formatPrice = (price) => {
            return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(price);
        };

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
            return FALLBACK_IMAGE;
        };

        return (
            <div className="animate-fade-in">
                <button 
                    onClick={() => {
                        // Clear products when going back
                        setCategoryProducts([]);
                        setProductsLoading(false);
                        setStep(3);
                    }} 
                    className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]"
                >
                    <ArrowLeft size={16} className="mr-2" /> Back
                </button>
                <h2 className="text-3xl font-bold text-center mb-4 text-[#273e8e]">
                Build My System
                </h2>
                <p className="text-center text-gray-600 mb-2">
                    Select multiple products to create your custom bundle
                </p>
                <p className="text-center text-sm text-orange-600 mb-8 font-semibold">
                    * You must select at least one product to continue
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
                        <p className="text-gray-600">No products available at the moment.</p>
                        <button
                            onClick={() => setStep(3)}
                            className="mt-4 text-[#273e8e] hover:underline"
                        >
                            Go back
                        </button>
                    </div>
                ) : (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                        {orderedCategoryProducts.map((product) => {
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
                                        {isSelected ? 'Remove from Bundle' : 'Add to Bundle'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    
                    {/* Continue Button - Show when at least one product is selected */}
                    {formData.selectedProducts.length > 0 && (
                        <div className="mt-8 flex justify-center">
                            <button
                                onClick={() => setStep(6.5)}
                                className="bg-[#273e8e] text-white px-8 py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors flex items-center"
                            >
                                Continue with {formData.selectedProducts.length} Product{formData.selectedProducts.length !== 1 ? 's' : ''} in Bundle
                                <ArrowRight size={20} className="ml-2" />
                            </button>
                        </div>
                    )}
                    </>
                )}
            </div>
        );
    };

    const renderStep3 = () => (
        <div className="animate-fade-in">
            <button onClick={() => setStep(2)} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e] transition-colors">
                <ArrowLeft size={16} className="mr-2" /> Back
            </button>
            {/* BNPL Badge */}
            <div className="flex justify-center mb-6">
                <span className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-bold bg-gradient-to-r from-[#273e8e] to-[#1a2b6b] text-white shadow-lg">
                    <CreditCard size={16} className="mr-2" />
                    Buy Now Pay Later
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
                <button onClick={() => navigate(`/tools?inverter=true&returnTo=bnpl&source=flow&category=${encodeURIComponent(formData.productCategory || 'full-kit')}`)} className="group bg-white border-2 border-gray-200 hover:border-[#273e8e] rounded-2xl p-8 hover:shadow-2xl transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden transform hover:-translate-y-1">
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

    const renderStep3_5 = () => {
        const formatPrice = (price) => {
            return new Intl.NumberFormat('en-NG', { 
                style: 'currency', 
                currency: 'NGN',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }).format(price || 0);
        };

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
                <button 
                    onClick={() => {
                        bundlesFetchedForLoadRef.current = false;
                        if (searchParams.get('fromCalculator') === 'true' || searchParams.get('q')) {
                            const q = searchParams.get('q') || '';
                            const qParam = q ? `&q=${encodeURIComponent(q)}` : '';
                            navigate(
                                `/tools?inverter=true&returnTo=bnpl&source=flow&category=${encodeURIComponent(formData.productCategory || 'full-kit')}${qParam}`
                            );
                            return;
                        }
                        setStep(3);
                    }} 
                    className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]"
                >
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
                            href={`/tools?inverter=true&returnTo=bnpl&source=flow&category=${encodeURIComponent(formData.productCategory || 'full-kit')}&q=${encodeURIComponent(searchParams.get('q') || '')}`}
                            className="text-[#273e8e] underline font-bold text-base"
                        >
                            Edit load
                        </a>
                    </p>
                )}
                {!searchParams.get('q') && <div className="mb-8" />}
                {!bundlesLoading && bnplMinimumLoanAmount > 0 && (
                    <p className="text-center text-sm text-gray-500 mb-5">
                        BNPL eligible bundles only: minimum amount is ₦{bnplMinimumLoanAmount.toLocaleString()}.
                    </p>
                )}

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
                                : bnplMinimumLoanAmount > 0
                                ? `No BNPL-eligible bundles available at the moment (minimum ₦${bnplMinimumLoanAmount.toLocaleString()}).`
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
                                    bundlesFetchedForLoadRef.current = false;
                                    loadBundlesForSelectionStep();
                                }}
                                className="mt-2 block mx-auto text-[#273e8e] hover:underline font-semibold text-sm"
                            >
                                Try again
                            </button>
                        )}
                        <button
                            onClick={() => setStep(3)}
                            className="mt-4 block mx-auto text-[#273e8e] hover:underline"
                        >
                            Go back
                        </button>
                    </div>
                ) : (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                        {paginatedBundles.map((bundle) => {
                            const price = Number(bundle.discount_price || bundle.total_price || 0);
                            const oldPrice = bundle.discount_price && bundle.total_price && bundle.discount_price < bundle.total_price 
                                ? Number(bundle.total_price) 
                                : null;
                            const discount = oldPrice && price < oldPrice
                                ? Math.round(((oldPrice - price) / oldPrice) * 100)
                                : 0;
                            
                            // Check if bundle is selected
                            const isSelected = formData.selectedBundles.some(b => b.id === bundle.id);
                            const isRec = entityHighlyRecommended(bundle);
                            const isHot = entityTopDeal(bundle);
                            const isPromoHighlight = isRec || isHot;
                            
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
                                    <div className="block">
                                        <div className="aspect-square w-full mb-4 rounded-lg overflow-hidden bg-gray-100 relative">
                                            <img
                                                src={getBundleImage(bundle)}
                                                alt={bundle.title || bundle.name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
                                            {isSelected && (
                                                <div className="absolute top-2 right-2 z-[16] bg-[#273e8e] text-white rounded-full p-2">
                                                    <CheckCircle size={20} />
                                                </div>
                                            )}
                                        </div>
                                        <h3 className="font-bold text-lg mb-2 text-gray-800 group-hover:text-[#273e8e] transition-colors">
                                            {bundle.title || bundle.name || `Bundle #${bundle.id}`}
                                        </h3>
                                        <p className="text-sm text-gray-500 mb-2">{getBundleCategoryLabel(bundle)}</p>
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
                                    
                                    {/* Learn More Button */}
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            // Fetch full bundle details with fees
                                            try {
                                                setBundlesLoading(true);
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
                                                setBundlesLoading(false);
                                            }
                                        }}
                                        className="w-full mb-2 py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Info size={16} />
                                        Learn More
                                    </button>
                                    
                                    <button
                                        onClick={() => handleBundleSelect(bundle)}
                                        className={`w-full py-2 rounded-lg font-semibold transition-colors ${
                                            isSelected
                                                ? 'bg-red-600 text-white hover:bg-red-700'
                                                : 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
                                        }`}
                                    >
                                        {isSelected ? 'Remove from Selection' : 'Select bundle'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {!bundlesLoading && totalBundlePages > 1 && (
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
                    {!bundlesLoading && filteredBundles.length > 0 && (
                        <p className="text-center text-sm text-gray-500 mt-4">
                            Showing {bundleGridStart + 1} - {Math.min(bundleGridStart + BUNDLE_STEP_GRID_PAGE_SIZE, filteredBundles.length)} of {filteredBundles.length} {isInverterFlow ? 'solutions' : 'bundles'}
                        </p>
                    )}
                    
                    {/* Continue Button - Show when at least one bundle is selected */}
                    {formData.selectedBundles.length > 0 && (
                        <div className="mt-8 flex justify-center">
                            <button
                                onClick={() => setStep(6.5)}
                                className="bg-[#273e8e] text-white px-8 py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors flex items-center"
                            >
                                Continue with {formData.selectedBundles.length} {formData.selectedBundles.length !== 1 ? 'Items' : 'Item'} Selected
                                <ArrowRight size={20} className="ml-2" />
                            </button>
                        </div>
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
                                        alt={bundle.title || bundle.name || 'Bundle'}
                                        className="max-h-[80%] object-contain"
                                        onError={(e) => {
                                            // Prevent infinite loop - only set fallback if not already set
                                            if (e.target.src && !e.target.src.includes(FALLBACK_IMAGE)) {
                                                e.target.src = FALLBACK_IMAGE;
                                            }
                                        }}
                                    />
                                </div>

                                {/* Content */}
                                <div className="p-4">
                                    <h2 className="text-xl font-semibold">
                                        {bundle.title || bundle.name || `Bundle #${bundle.id}`}
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
                                    alt={bundle.title || bundle.name || 'Bundle'}
                                    className="max-h-[80%] object-contain"
                                    onError={(e) => {
                                        e.target.src = FALLBACK_IMAGE;
                                    }}
                                />
                            </div>

                            {/* Title + Price */}
                            <div className="pt-3">
                                <h2 className="text-[12px] lg:text-[16px] font-semibold text-[#0F172A]">
                                    {bundle.title || bundle.name || `Bundle #${bundle.id}`}
                                </h2>
                                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0 mt-[2px]">
                                    <p className="text-[12px] text-gray-500">{getBundleCategoryLabel(bundle)}</p>
                                </div>
                                {bundle.backup_info && (
                                    <p className="text-[12px] text-gray-500 mt-[2px]">{bundle.backup_info}</p>
                                )}

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

    const renderStep4 = () => (
        <div className="animate-fade-in">
            <button onClick={() => setStep(3)} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
                <ArrowLeft size={16} className="mr-2" /> Back
            </button>
            <h2 className="text-3xl font-bold text-center mb-8 text-[#273e8e]">
                Where is the audit for?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
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
        </div>
    );

    const renderStep5 = () => {
        const isCommercial = formData.auditType === 'commercial';
        const isOffice = formData.auditType === 'home-office' && formData.auditSubtype === 'office';
        const isHome = formData.auditType === 'home-office' && !isOffice;
        const auditBackStep = isCommercial ? 1 : 4;
        const formTitle = isCommercial
            ? 'Commercial/Industrial Details'
            : isOffice
                ? 'Office Details'
                : 'Property Details';

        const stateBlock = (
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

        const homeInvalid =
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

        const officeInvalid =
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

        const commercialInvalid =
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

        const submitDisabled = isCommercial ? commercialInvalid : isOffice ? officeInvalid : homeInvalid;

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
                                            <span className="ml-2">(₦{Number(item.unit_price || 0).toLocaleString()})</span>
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
                <form onSubmit={handleAddressSubmit} className="space-y-4">
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
                            {stateBlock}
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
                            {stateBlock}
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
                            {stateBlock}
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
                        disabled={submitDisabled}
                        className={`w-full py-4 rounded-xl font-bold transition-colors ${
                            submitDisabled
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
                    {submitDisabled && !loading && (
                        <p className="text-sm text-red-600 text-center">Please fill in all required fields.</p>
                    )}
                </form>
            </div>
        );
    };

    const renderStep6 = () => {
        const auditKindLabel =
            formData.auditType === 'commercial'
                ? 'commercial / industrial'
                : formData.auditSubtype === 'office'
                    ? 'office'
                    : 'home';

        return (
            <div className="animate-fade-in max-w-lg w-full mx-auto text-center px-2">
                <div className="bg-[#FFFDF8] border border-amber-100/80 shadow-sm p-8 md:p-10 rounded-2xl">
                    <div className="w-16 h-16 rounded-full bg-amber-100/90 flex items-center justify-center mx-auto mb-6 ring-4 ring-amber-50">
                        <AlertCircle className="w-9 h-9 text-amber-800/90" strokeWidth={2.25} />
                    </div>
                    <h2 className="text-2xl font-bold mb-4 text-[#1e3a5f]">Audit Request Submitted</h2>
                    <p className="text-gray-600 mb-3 text-[15px] leading-relaxed">
                        Your {auditKindLabel} audit request has been submitted successfully{' '}
                        <span className="whitespace-nowrap">(Request ID: #{formData.auditRequestId})</span>.
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
                            onClick={handleCheckAuditRequestStatus}
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

    const extractBundleLineItems = (bundle) => {
        const toNumber = (v) => typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, '')) || 0;
        const stripFeeVisibilityPrefix = (title) => {
            const t = String(title || '');
            if (t.startsWith(FEE_VIS_TROO_PREFIX)) return t.slice(FEE_VIS_TROO_PREFIX.length).trim();
            if (t.startsWith(FEE_VIS_OWN_PREFIX)) return t.slice(FEE_VIS_OWN_PREFIX.length).trim();
            if (t.startsWith(FEE_VIS_BOTH_PREFIX)) return t.slice(FEE_VIS_BOTH_PREFIX.length).trim();
            return t;
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
            return n.includes('inverter') || n.includes('battery') || n.includes('solar panel') || n.includes('solar panel');
        };
        const isFeeName = (name) => {
            if (!name) return false;
            const n = name.toLowerCase();
            return n.includes('installation fee') || n.includes('delivery fee') || n.includes('inspection fee');
        };

        // 1. Products from bundle_items (preferred source)
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

        // 1b. Fallback: if bundle_items is empty, derive products from product_model field
        if (productRows.length === 0 && bundle?.product_model) {
            const modelParts = bundle.product_model.split('/').map(s => s.trim()).filter(Boolean);
            modelParts.forEach((part) => {
                productRows.push({ description: part, quantity: 1, unit: 'Nos', quantityApplies: true, rate: 0 });
            });
        }

        // 2. Gather all materials from bundle_materials or materials
        const relMaterials = bundle?.bundle_materials ?? [];
        const materialsList = relMaterials.length > 0 ? relMaterials : (bundle?.materials ?? []);

        // If bundle_items was empty, try to extract products and fees from materials list
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
                fallbackServiceRows.push({
                    description: name,
                    quantity: qty,
                    unit: qtyMeta.unit,
                    quantityApplies: qtyMeta.quantityApplies,
                    rate,
                });
            } else {
                pureInstallMaterials.push({ name, qty, rate });
            }
        });

        // 3. Custom services / fees (preferred source)
        const OL_PREFIX = '[OL]';
        const OL_VIS_TROO_PREFIX = '[OL:TROOSOLAR]';
        const OL_VIS_OWN_PREFIX = '[OL:OWN]';
        const serviceRows = [];
        const customOrderItems = [];
        const relServicesAll = bundle?.customServices ?? bundle?.custom_services ?? [];
        const relServices = filterBundleCustomServicesByFlow(relServicesAll, BUNDLE_CHECKOUT_FLOWS.BNPL);
        const hasCustomServiceFeeRows = relServices.some((s) => {
            const t = String(s?.title || '');
            return !t.startsWith(OL_PREFIX) && !t.startsWith(OL_VIS_TROO_PREFIX) && !t.startsWith(OL_VIS_OWN_PREFIX);
        });
        const stripOrderItemPrefix = (title) => {
            const t = String(title || '');
            if (t.startsWith(OL_VIS_TROO_PREFIX)) return t.slice(OL_VIS_TROO_PREFIX.length).trim();
            if (t.startsWith(OL_VIS_OWN_PREFIX)) return t.slice(OL_VIS_OWN_PREFIX.length).trim();
            if (t.startsWith(OL_PREFIX)) return t.slice(OL_PREFIX.length).trim();
            return t;
        };
        relServices.forEach((s) => {
            const rawTitle = s?.title || 'Custom Service';
            if (rawTitle.startsWith(OL_PREFIX) || rawTitle.startsWith(OL_VIS_TROO_PREFIX) || rawTitle.startsWith(OL_VIS_OWN_PREFIX)) {
                const cleanTitle = stripOrderItemPrefix(rawTitle);
                const qtyMeta = resolveQtyAndUnit([s], 1, 'Nos');
                customOrderItems.push({
                    description: cleanTitle,
                    quantity: qtyMeta.quantity,
                    unit: qtyMeta.unit,
                    quantityApplies: qtyMeta.quantityApplies,
                    rate: toNumber(s?.service_amount),
                });
            } else {
                const qtyMeta = resolveQtyAndUnit([s], 1, /inspection/i.test(rawTitle) ? 'Lots' : 'Nos');
                serviceRows.push({
                    description: stripFeeVisibilityPrefix(rawTitle),
                    quantity: qtyMeta.quantity,
                    unit: qtyMeta.unit,
                    quantityApplies: qtyMeta.quantityApplies,
                    rate: toNumber(s?.service_amount),
                });
            }
        });

        // Invoice fees come only from admin-configured custom_services (never material fallbacks).
        const billableServiceRows = filterBillableInvoiceFees(serviceRows);

        // Build the flat items list for ORDER LIST
        // If admin has set [OL] custom order items, use those instead of bundle_items products
        const orderListItems = customOrderItems.length > 0
            ? [...customOrderItems]
            : [...productRows];

        // Build the flat items list for INVOICE (order list items + billable fees only)
        const invoiceItems = [...orderListItems, ...billableServiceRows];

        const orderListTotal = orderListItems.reduce((s, i) => s + (i.rate * i.quantity), 0);

        return {
            items: orderListItems,
            itemsTotal: orderListTotal,
            orderListItems,
            invoiceItems,
            serviceRows: billableServiceRows,
            productRows,
            hasCustomServiceFeeRows,
        };
    };

    const getBnplDeliveryFeeFallback = () => {
        const selectedState = states.find((s) => s.id === formData.stateId);
        return resolveFlowDeliveryFee({
            productCategory: formData.productCategory,
            categoryDeliveryFees: checkoutSettings?.category_delivery_fees,
            defaultDeliveryFee: checkoutSettings?.delivery_fee,
            stateDeliveryFee: selectedState?.default_delivery_fee,
        });
    };

    // Keep BNPL pricing consistent across Invoice and Loan Calculator steps.
    const getBnplPricingSnapshot = () => {
        const bundlesTotal = formData.selectedBundles.reduce((sum, b) => sum + (b.price * (b.quantity || 1)), 0);
        const productsTotal = formData.selectedProducts.reduce((sum, p) => sum + (p.price * (p.quantity || 1)), 0);
        const itemsSubtotal = bundlesTotal + productsTotal;
        const basePrice = itemsSubtotal > 0 ? itemsSubtotal : formData.selectedProductPrice;

        const vatPercent = 7.5;

        const bundleInvoiceSections = formData.selectedBundles.map((sb) => {
            const bundleQty = sb.quantity || 1;
            const bundleObj = sb.bundle;
            const bundleName = bundleObj?.title || bundleObj?.name || `Bundle #${sb.id}`;
            const bundleTotalPrice = (sb.price || 0) * bundleQty;
            const { invoiceItems, serviceRows, orderListItems } = extractBundleLineItems(bundleObj);
            const pricedOrderLines = orderListItems.filter((i) => i.rate > 0);
            let displayItems = invoiceItems;
            if (pricedOrderLines.length === 0 && serviceRows.length > 0) {
                displayItems = [
                    {
                        description: bundleName,
                        quantity: 1,
                        unit: 'Nos',
                        quantityApplies: true,
                        rate: sb.price || 0,
                    },
                    ...serviceRows,
                ];
            }

            let allRows = [];
            if (displayItems.length > 0) {
                allRows = displayItems.map((item, idx) => ({
                    id: `inv-${sb.id}-${idx}`,
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
            } else {
                allRows = [{
                    id: `inv-${sb.id}-main`,
                    description: bundleName,
                    quantity: bundleQty,
                    unit: 'Nos',
                    rate: sb.price || 0,
                    totalCost: bundleTotalPrice,
                    isBold: true,
                }];
            }

            const feesSum = serviceRows.reduce(
                (s, r) => s + (r.rate * (r.quantityApplies === false ? 1 : r.quantity)),
                0
            );
            // Bundle list price is authoritative; fees from admin are additive only when amount > 0
            const sectionNetTotal = bundleTotalPrice + feesSum;
            const sectionVat = (sectionNetTotal * vatPercent) / 100;
            const sectionGrandTotal = sectionNetTotal + sectionVat;

            return { bundleName, allRows, netTotal: sectionNetTotal, vatAmount: sectionVat, grandTotal: sectionGrandTotal };
        });

        const productInvoiceRows = formData.selectedProducts.map((p) => {
            const qty = p.quantity || 1;
            const unitPrice = p.price || 0;
            return {
                id: `inv-p-${p.id}`,
                description: p.product?.title || p.product?.name || `Product #${p.id}`,
                quantity: qty,
                unit: 'Nos',
                rate: unitPrice,
                totalCost: unitPrice * qty,
            };
        });

        if (bundleInvoiceSections.length === 0 && productInvoiceRows.length === 0 && (formData.selectedBundle || formData.selectedProduct)) {
            const label = formData.selectedBundle?.title || formData.selectedProduct?.title || formData.selectedProduct?.name || 'Item';
            productInvoiceRows.push({ id: 'inv-single', description: label, quantity: 1, unit: 'Nos', rate: basePrice, totalCost: basePrice });
        }

        const allItemsTotal = bundleInvoiceSections.reduce((s, sec) => s + sec.netTotal, 0) + productInvoiceRows.reduce((s, r) => s + r.totalCost, 0);
        const overallNetTotal = allItemsTotal;
        const overallVat = (overallNetTotal * vatPercent) / 100;
        const overallGrandTotal = overallNetTotal + overallVat;

        return {
            basePrice,
            catalogSubtotal: basePrice,
            vatPercent,
            bundleInvoiceSections,
            productInvoiceRows,
            overallNetTotal,
            overallVat,
            overallGrandTotal,
        };
    };

    const renderStep6_5 = () => {
        if (formData.optionType === 'audit') {
            return renderStep6();
        }

        // Calculate totals
        const bundlesTotal = formData.selectedBundles.reduce((sum, b) => sum + (b.price * (b.quantity || 1)), 0);
        const productsTotal = formData.selectedProducts.reduce((sum, p) => sum + (p.price * (p.quantity || 1)), 0);
        const itemsSubtotal = bundlesTotal + productsTotal;
        const basePrice = itemsSubtotal > 0 ? itemsSubtotal : formData.selectedProductPrice;

        // ORDER LIST FOR CUSTOMERS: each bundle shows its component items
        // The bundle's total price (sb.price) is ALWAYS the authoritative Sub-Total —
        // individual item prices from the API may be ₦0 (backend doesn't expose component prices).
        const bundleSections = formData.selectedBundles.map((sb) => {
            const bundleQty = sb.quantity || 1;
            const bundleObj = sb.bundle;
            const bundleName = bundleObj?.title || bundleObj?.name || `Bundle #${sb.id}`;
            const bundleTotalPrice = (sb.price || 0) * bundleQty;
            const { orderListItems } = extractBundleLineItems(bundleObj);

            let rows;
            if (orderListItems.length > 0) {
                rows = orderListItems.map((item, idx) => ({
                    id: `b-${sb.id}-${idx}`,
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
            return { bundleName, rows, subTotal: bundleTotalPrice };
        });

        // Individual products (not in a bundle)
        const productRows = formData.selectedProducts.map((sp) => {
            const qty = sp.quantity || 1;
            const unitPrice = sp.price || 0;
            return {
                id: `p-${sp.id}`,
                description: sp.product?.title || sp.product?.name || `Product #${sp.id}`,
                quantity: qty,
                unit: 'Nos',
                rate: unitPrice,
                totalCost: unitPrice * qty,
            };
        });

        // Fallback single item
        if (bundleSections.length === 0 && productRows.length === 0 && (formData.selectedBundle || formData.selectedProduct || formData.optionType === 'audit')) {
            const label = formData.optionType === 'audit' ? 'Professional Energy Audit' : (formData.selectedBundle?.title || formData.selectedProduct?.title || formData.selectedProduct?.name || 'Item');
            productRows.push({ id: 'single', description: label, quantity: 1, unit: 'Nos', rate: basePrice, totalCost: basePrice });
        }

        const overallSubTotal = bundleSections.reduce((s, sec) => s + sec.subTotal, 0) + productRows.reduce((s, r) => s + r.totalCost, 0);

        return (
            <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <button onClick={() => setStep(formData.optionType === 'audit' ? 5 : (formData.optionType === 'choose-system' ? 3.5 : (formData.optionType ? 3 : 2)))} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
                    <ArrowLeft size={16} className="mr-2" /> Back
                </button>
                <h2 className="text-2xl font-bold mb-4 text-[#273e8e] border-b pb-4">Order Summary</h2>

                {enrichingBundles && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                        <Loader className="animate-spin" size={16} /> Loading item details...
                    </div>
                )}

                {/* Per-bundle ORDER LIST FOR CUSTOMERS (matches Excel sheet) */}
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
                                            <td className="py-3 px-2 text-gray-800">{row.description}</td>
                                            <td className="py-3 px-2 text-center">{row.quantity}</td>
                                            <td className="py-3 px-2 text-center text-gray-600">{row.unit}</td>
                                            <td className="py-3 px-2 text-right text-gray-600">{row.rate > 0 ? `₦${Number(row.rate).toLocaleString()}` : <span className="italic text-gray-400">Included</span>}</td>
                                            <td className="py-3 px-2 text-right font-semibold">{row.totalCost > 0 ? `₦${Number(row.totalCost).toLocaleString()}` : <span className="italic text-gray-400">Included</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-gray-300">
                                        <td colSpan={4} className="py-3 px-2 font-bold text-gray-800">Sub-Total</td>
                                        <td className="py-3 px-2 text-right font-bold text-lg">₦{Number(section.subTotal).toLocaleString()}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                ))}

                {/* Individual products (not part of a bundle) */}
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
                                            <td className="py-3 px-2 text-gray-800">{row.description}</td>
                                            <td className="py-3 px-2 text-center">{row.quantity}</td>
                                            <td className="py-3 px-2 text-center text-gray-600">{row.unit}</td>
                                            <td className="py-3 px-2 text-right">₦{Number(row.rate).toLocaleString()}</td>
                                            <td className="py-3 px-2 text-right font-semibold">₦{Number(row.totalCost).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-gray-300">
                                        <td colSpan={4} className="py-3 px-2 font-bold text-gray-800">Sub-Total</td>
                                        <td className="py-3 px-2 text-right font-bold text-lg">₦{Number(productRows.reduce((s, r) => s + r.totalCost, 0)).toLocaleString()}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                )}

                {/* Overall Sub-Total if multiple sections */}
                {(bundleSections.length + (productRows.length > 0 ? 1 : 0)) > 1 && (
                    <div className="border-t-2 border-[#273e8e] pt-3 mb-6 flex justify-between items-center">
                        <span className="font-bold text-lg text-gray-800">Overall Sub-Total</span>
                        <span className="font-bold text-xl text-[#273e8e]">₦{Number(overallSubTotal || basePrice || 0).toLocaleString()}</span>
                    </div>
                )}

                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
                    <p className="text-sm text-blue-700">
                        <strong>Note:</strong> {formData.optionType === 'audit'
                            ? 'This is your order list. You can proceed directly to the loan calculator (no audit payment is required here).'
                            : 'This is your order list. The full invoice with fees, VAT, and grand total will be shown on the next step.'}
                    </p>
                </div>

                <button
                    onClick={() => {
                        if (formData.optionType === 'audit') {
                            setStep(8);
                            return;
                        }
                        setStep(6.75); // Go to Invoice
                    }}
                    className="w-full bg-[#273e8e] text-white py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors"
                >
                    {formData.optionType === 'audit' ? 'Proceed to Loan Calculator' : 'Proceed to Invoice'}
                </button>
            </div>
        );
    };

    const handleUpfrontDepositPayment = async () => {
        if (!applicationId || !formData.loanDetails) {
            alert("Application details missing. Please try again.");
            return;
        }

        const depositAmount = formData.loanDetails.depositAmount;
        if (!depositAmount || depositAmount <= 0) {
            alert("Invalid deposit amount. Please contact support.");
            return;
        }

        setProcessingPayment(true);
        try {
            await ensureFlutterwave();

            const txRef = "deposit_" + applicationId + "_" + Date.now();
            const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
            const userEmail = userInfo.email || 'customer@troosolar.com';
            const userName = userInfo.name || userInfo.full_name || 'Customer';

            window.FlutterwaveCheckout({
                public_key: FLUTTERWAVE_PUBLIC_KEY,
                tx_ref: txRef,
                amount: depositAmount,
                currency: "NGN",
                payment_options: "card,ussd,banktransfer",
                customer: {
                    email: userEmail,
                    name: userName,
                },
                callback: async (response) => {
                    if (response?.status === "successful") {
                        if (typeof window.closePaymentModal === 'function') {
                            window.closePaymentModal();
                        }
                        try {
                            const token = localStorage.getItem('access_token');
                            // Confirm deposit payment
                            const confirmed = await confirmDepositPayment(
                                applicationId,
                                response.transaction_id,
                                depositAmount
                            );
                            
                            if (confirmed) {
                                setPaymentResult('success');
                                alert("Upfront deposit payment successful! Your application will proceed to the next step.");
                                // Navigate to BNPL loans page to view order details
                                navigate('/bnpl-loans');
                            } else {
                                alert("Payment verification failed. Please contact support if amount was debited.");
                                setPaymentResult('failed');
                            }
                        } catch (error) {
                            console.error("Payment confirmation error:", error);
                            alert("Payment successful but confirmation failed. Please contact support.");
                            setPaymentResult('failed');
                        }
                    } else {
                        setPaymentResult('failed');
                        alert("Payment was not successful. Please try again.");
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

    const confirmDepositPayment = async (applicationId, txId, amount) => {
        const token = localStorage.getItem('access_token');
        if (!token) return false;
        try {
            const payload = {
                amount_paid: amount,
            };
            if (txId != null && txId !== '') {
                payload.transaction_reference = String(txId);
            }
            const { data } = await axios.post(
                API.BNPL_CONFIRM_DOWN_PAYMENT(applicationId),
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

    const confirmAuditPayment = async (orderId, txId, amount) => {
        const token = localStorage.getItem('access_token');
        if (!token) return false;
        try {
            const { data } = await axios.post(
                API.Payment_Confirmation,
                {
                    amount: String(amount),
                    orderId: Number(orderId),
                    txId: String(txId || ""),
                    type: "audit",
                },
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

    const handleAuditPayment = async () => {
        const auditFee = 50000;
        setProcessingPayment(true);
        try {
            await ensureFlutterwave();

            const txRef = "audit_" + Date.now();
            const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
            const userEmail = userInfo.email || 'customer@troosolar.com';
            const userName = userInfo.name || userInfo.full_name || 'Customer';

            window.FlutterwaveCheckout({
                public_key: FLUTTERWAVE_PUBLIC_KEY,
                tx_ref: txRef,
                amount: auditFee,
                currency: "NGN",
                payment_options: "card,ussd,banktransfer",
                customer: {
                    email: userEmail,
                    name: userName,
                },
                callback: async (response) => {
                    if (response?.status === "successful") {
                        if (typeof window.closePaymentModal === 'function') {
                            window.closePaymentModal();
                        }
                        // Create audit order and confirm payment
                        try {
                            const token = localStorage.getItem('access_token');
                            // Create audit order with audit_request_id and property details
                            // Backend will generate invoice based on location, address, floors, and rooms
                            const checkoutPayload = {
                                    customer_type: formData.customerType,
                                    product_category: 'audit',
                                amount: auditFee, // Base amount, backend may adjust based on property details
                                    audit_type: formData.auditType,
                            };
                            
                            // Include audit_request_id if available (links order to audit request)
                            if (formData.auditRequestId) {
                                checkoutPayload.audit_request_id = formData.auditRequestId;
                            }
                            
                            // Include property details for invoice generation
                            // Backend will use these to calculate final invoice amount
                            if (formData.state) checkoutPayload.property_state = formData.state;
                            if (formData.address || (formData.houseNo && formData.streetName)) {
                                const fullAddress = [
                                    formData.houseNo,
                                    formData.streetName,
                                    formData.landmark
                                ].filter(Boolean).join(', ');
                                checkoutPayload.property_address = fullAddress || formData.address;
                            }
                            if (formData.floors) checkoutPayload.property_floors = Number(formData.floors);
                            if (formData.rooms) checkoutPayload.property_rooms = Number(formData.rooms);
                            
                            const orderResponse = await axios.post(
                                API.BUY_NOW_CHECKOUT,
                                checkoutPayload,
                                {
                                    headers: {
                                        Authorization: `Bearer ${token}`,
                                        'Content-Type': 'application/json',
                                        Accept: 'application/json'
                                    }
                                }
                            );

                            if (orderResponse.data.status === 'success') {
                                const orderId = orderResponse.data.data.order_id;
                                setAuditOrderId(orderId);
                                
                                const confirmed = await confirmAuditPayment(
                                    orderId,
                                    response.transaction_id,
                                    auditFee
                                );
                                
                                if (confirmed) {
                                    setPaymentResult('success');
                                    // Fetch calendar slots for audit (48 hours after payment confirmation)
                                    // Backend will filter to show only slots 48 hours after payment_date
                                    const paymentConfirmationDate = new Date().toISOString().split('T')[0];
                                    await fetchAuditCalendarSlots(paymentConfirmationDate);
                                    setStep(7.5); // Go to calendar selection step
                                } else {
                                    alert("Payment verification failed. Please contact support if amount was debited.");
                                    setPaymentResult('failed');
                                }
                            } else {
                                alert("Failed to create audit order. Please contact support.");
                                setPaymentResult('failed');
                            }
                        } catch (error) {
                            console.error("Order creation error:", error);
                            alert("Payment successful but failed to create order. Please contact support.");
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

    const fetchAuditCalendarSlots = async (paymentDate = null) => {
        try {
            const token = localStorage.getItem('access_token');
            // Use payment confirmation date (current date when payment is confirmed)
            // Backend will filter to show only slots 48 hours after this date
            const date = paymentDate || new Date().toISOString().split('T')[0];
            const response = await axios.get(`${API.CALENDAR_SLOTS}?type=audit&payment_date=${date}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data.status === 'success') {
                setAuditCalendarSlots(response.data.data.slots || []);
            }
        } catch (error) {
            console.error("Calendar Error:", error);
            // Set empty slots if API fails
            setAuditCalendarSlots([]);
        }
    };

    const renderStep6_75 = () => {
        const {
            vatPercent,
            bundleInvoiceSections,
            productInvoiceRows,
            overallNetTotal,
            overallVat,
            overallGrandTotal,
        } = getBnplPricingSnapshot();

        return (
            <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                <button onClick={() => setStep(6.5)} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
                    <ArrowLeft size={16} className="mr-2" /> Back
                </button>
                <h2 className="text-2xl font-bold mb-4 text-[#273e8e] border-b pb-4">Invoice</h2>

                {/* Per-bundle invoice sections (matches Excel FOR INVOICE template) */}
                {bundleInvoiceSections.map((section, sIdx) => (
                    <div key={`inv-section-${sIdx}`} className="mb-8">
                        <h3 className="text-base font-semibold text-[#273e8e] mb-2 uppercase tracking-wide">
                            Invoice — {section.bundleName}
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
                                    {section.allRows.map((row) => (
                                        <tr key={row.id} className={`border-b border-gray-100 ${row.isDetail ? 'bg-gray-50/50' : ''}`}>
                                            <td className={`py-3 px-2 ${row.isBold ? 'font-semibold text-gray-900' : row.isDetail ? 'text-gray-500 text-xs' : 'text-gray-800'}`}>{row.description}</td>
                                            <td className="py-3 px-2 text-center">{row.isDetail ? row.quantity : row.quantity}</td>
                                            <td className="py-3 px-2 text-center text-gray-600">{row.unit}</td>
                                            <td className="py-3 px-2 text-right">{row.isDetail ? <span className="text-gray-400 text-xs">Included</span> : (row.rate > 0 ? `₦${Number(row.rate).toLocaleString()}` : '—')}</td>
                                            <td className="py-3 px-2 text-right font-semibold">{row.isDetail ? '' : (row.totalCost > 0 ? `₦${Number(row.totalCost).toLocaleString()}` : '—')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-gray-300">
                                        <td colSpan={4} className="py-3 px-2 font-bold text-gray-800">Sum-Total</td>
                                        <td className="py-3 px-2 text-right font-bold">₦{Number(section.netTotal).toLocaleString()}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                ))}

                {/* Individual products section */}
                {productInvoiceRows.length > 0 && (
                    <div className="mb-8">
                        {bundleInvoiceSections.length > 0 && (
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
                                    {productInvoiceRows.map((row) => (
                                        <tr key={row.id} className="border-b border-gray-100">
                                            <td className="py-3 px-2 text-gray-800">{row.description}</td>
                                            <td className="py-3 px-2 text-center">{row.quantity}</td>
                                            <td className="py-3 px-2 text-center text-gray-600">{row.unit}</td>
                                            <td className="py-3 px-2 text-right">₦{Number(row.rate).toLocaleString()}</td>
                                            <td className="py-3 px-2 text-right font-semibold">₦{Number(row.totalCost).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Overall Grand Total (across all bundles) */}
                <div className="bg-[#273e8e]/5 border border-[#273e8e]/20 rounded-lg p-4 mb-6">
                    <div className="flex justify-between items-center text-sm text-gray-700 mb-1">
                        <span>Sum-Total</span>
                        <span className="font-semibold">₦{new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(overallNetTotal || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm text-gray-700 mb-2">
                        <span>VAT ({vatPercent}%)</span>
                        <span className="font-semibold">₦{new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(overallVat || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-[#273e8e]/20 pt-2">
                        <span className="font-bold text-lg text-[#273e8e]">Grand Total</span>
                        <span className="font-bold text-xl text-[#273e8e]">₦{new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(overallGrandTotal || 0)}</span>
                    </div>
                </div>

                <button
                    onClick={() => {
                        const minOrderValue = bnplMinimumLoanAmount > 0 ? bnplMinimumLoanAmount : 1500000;
                        if (overallGrandTotal < minOrderValue) {
                            alert(`Your order total (₦${overallGrandTotal.toLocaleString()}) does not meet the minimum ₦${minOrderValue.toLocaleString()} amount required for credit financing. To qualify for Buy Now, Pay Later, please add more items to your cart. Thank you.`);
                            return;
                        }
                        setStep(8); // Go to Loan Calculator
                    }}
                    className="w-full bg-[#273e8e] text-white py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors"
                >
                    Proceed to Loan Calculator
                </button>
            </div>
        );
    };

    const renderStep7 = () => (
        <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <button onClick={() => setStep(6.5)} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
                <ArrowLeft size={16} className="mr-2" /> Back
            </button>
            <h2 className="text-2xl font-bold mb-6 text-[#273e8e] border-b pb-4">Audit Invoice</h2>
            <div className="space-y-4 mb-8">
                <div className="flex justify-between">
                    <span>Audit Fee</span>
                    <span className="font-bold">₦50,000</span>
                </div>
                <div className="border-t pt-4 font-bold text-xl flex justify-between">
                    <span>Total</span>
                    <span className="text-[#273e8e]">₦50,000</span>
                </div>
            </div>
            <button 
                onClick={handleAuditPayment}
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

    const renderStep7_5 = () => (
        <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            {paymentResult === 'success' ? (
                <>
                    <div className="mb-6">
                        <div className="flex items-center mb-4">
                            <CheckCircle2 size={32} className="text-green-600 mr-3" />
                            <h2 className="text-2xl font-bold text-green-700">Payment Successful!</h2>
                        </div>
                        <p className="text-gray-600 mb-6">
                            Your audit payment has been confirmed. Please select your preferred audit date.
                        </p>
                    </div>

                    {/* Calendar Slots Section */}
                    {auditCalendarSlots.length > 0 ? (() => {
                        // Group slots by date to get unique dates only
                        const uniqueDates = [];
                        const dateMap = new Map();
                        
                        auditCalendarSlots.forEach(slot => {
                            if (!dateMap.has(slot.date)) {
                                dateMap.set(slot.date, slot);
                                uniqueDates.push(slot);
                            }
                        });

                        return (
                        <div className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <h3 className="font-bold text-[#273e8e] mb-3 flex items-center">
                                <Calendar size={20} className="mr-2" />
                                Available Audit Dates
                            </h3>
                            <p className="text-sm text-gray-600 mb-3">
                                    Audit slots are available starting 48 hours after payment confirmation. Select your preferred date:
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                                    {uniqueDates.slice(0, 9).map((slot, idx) => {
                                        const dateStr = new Date(slot.date).toLocaleDateString('en-NG', { 
                                            weekday: 'short', 
                                            month: 'short', 
                                            day: 'numeric' 
                                        });
                                        const isSelected = selectedAuditSlot?.date === slot.date;
                                        
                                        return (
                                    <button
                                        key={idx}
                                        disabled={!slot.available}
                                                onClick={() => {
                                                    if (slot.available) {
                                                        // Select the first available slot for this date
                                                        const firstSlotForDate = auditCalendarSlots.find(s => 
                                                            s.date === slot.date && s.available
                                                        );
                                                        if (firstSlotForDate) {
                                                            setSelectedAuditSlot(firstSlotForDate);
                                                        }
                                                    }
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
                        </div>
                        );
                    })() : (
                        <div className="mb-8 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                            <p className="text-sm text-yellow-700">
                                Calendar slots will be available soon. Our team will contact you within 24-48 hours to schedule your audit.
                            </p>
                        </div>
                    )}

                    <button
                        onClick={() => {
                            // After selecting audit slot, continue to loan calculator
                            // Set a mock product price for the loan calculator
                            setFormData(prev => ({ ...prev, selectedProductPrice: 2500000 }));
                            setStep(8); // Go to Loan Calculator
                        }}
                        className="w-full bg-[#273e8e] text-white py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors"
                    >
                        Continue to Loan Calculator
                    </button>
                </>
            ) : (
                <div className="text-center">
                    <XCircle size={64} className="text-red-600 mx-auto mb-6" />
                    <h2 className="text-3xl font-bold mb-4 text-red-700">Payment Failed</h2>
                    <p className="text-gray-600 mb-6">
                        Your payment could not be processed. Please try again.
                    </p>
                    <div className="space-y-3">
                        <button
                            onClick={handleAuditPayment}
                            className="w-full bg-[#273e8e] text-white py-3 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors"
                        >
                            Try Again
                        </button>
                        <button
                            onClick={() => setStep(7)}
                            className="w-full border-2 border-gray-300 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                        >
                            Back to Invoice
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    const renderStep8 = () => {
        if (formData.optionType === 'audit') {
            return renderStep6();
        }

        const { overallGrandTotal, catalogSubtotal } = getBnplPricingSnapshot();
        const totalAmount = overallGrandTotal;

        const handleStartOver = () => {
            // Clear all selections and reset to Step 2
            setFormData(prev => ({
                ...prev,
                selectedBundles: [],
                selectedProducts: [],
                selectedBundleId: null,
                selectedBundle: null,
                selectedProductId: null,
                selectedProduct: null,
                selectedProductPrice: 0,
                productCategory: '',
                optionType: ''
            }));
            setStep(2); // Go back to product category selection (5 options)
        };

        return (
            <div className="animate-fade-in max-w-4xl mx-auto">
                <button
                    onClick={() => setStep(formData.optionType === 'audit' ? 6.5 : 6.75)}
                    className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]"
                >
                    <ArrowLeft size={16} className="mr-2" /> Back
                </button>
                <LoanCalculator 
                    totalAmount={totalAmount}
                    bundlePrice={catalogSubtotal}
                    onConfirm={handleLoanConfirm}
                    loanConfig={loanConfig}
                />
                <div className="mt-6 flex justify-center">
                    <button
                        onClick={handleStartOver}
                        className="border-2 border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors flex items-center"
                    >
                        <ArrowLeft size={18} className="mr-2" />
                        Start Over - Change Selection
                    </button>
                </div>
            </div>
        );
    };

    const buildLoanReviewSnapshot = () => {
        const ld = formData.loanDetails;
        if (!ld) return null;

        const { catalogSubtotal } = getBnplPricingSnapshot();
        const invoiceGrandTotal = Number(ld.grandTotal || ld.totalAmount || 0);
        const bundlePrice = Number(ld.bundlePrice || catalogSubtotal || 0);
        const depositPercent = Number(ld.depositPercent || 0);
        const depositAmount = Number(ld.depositAmount || 0);
        const tenor = Number(ld.tenor || 0);
        const interestRate = Number(ld.interestRate || 0);

        // Fee percentages come from admin BNPL settings.
        const insurancePct = Number(loanConfig?.insurance_fee_percentage ?? DEFAULT_INSURANCE_PERCENT);
        const managementPct = Number(loanConfig?.management_fee_percentage ?? 1);
        const legalPct = Number(loanConfig?.residual_fee_percentage ?? 1);

        // Insurance: 3% of catalog bundle price (order-list Sub-Total), never VAT-inclusive grand total.
        const insuranceFee = bundlePrice * (insurancePct / 100);

        const baseLoanAmount = Number(ld.principal || ld.totalLoanAmount || Math.max(invoiceGrandTotal - depositAmount, 0));
        const managementFee = baseLoanAmount * (managementPct / 100);
        const legalFee = baseLoanAmount * (legalPct / 100);
        const feesTotal = insuranceFee + managementFee + legalFee;
        const upfrontDepositTotal = depositAmount + feesTotal;

        const totalLoanAmount = baseLoanAmount;
        const totalAmount = invoiceGrandTotal + feesTotal;
        const totalInterestAmount = totalLoanAmount * (interestRate / 100) * tenor;
        const totalRepaymentAmount = totalLoanAmount + totalInterestAmount;
        const monthlyRepaymentAmount = tenor > 0 ? (totalRepaymentAmount / tenor) : 0;

        return {
            bundlePrice,
            invoiceGrandTotal,
            totalAmount,
            depositPercent,
            depositAmount,
            upfrontDepositTotal,
            baseLoanAmount,
            insurancePct,
            insuranceFee,
            managementPct,
            managementFee,
            legalPct,
            legalFee,
            feesTotal,
            totalLoanAmount,
            totalInterestAmount,
            totalRepaymentAmount,
            monthlyRepaymentAmount,
            tenor,
            interestRate,
        };
    };

    const renderStep9 = () => (
        <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <button onClick={() => setStep(8)} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
                <ArrowLeft size={16} className="mr-2" /> Back
            </button>
            <h2 className="text-2xl font-bold mb-6 text-[#273e8e]">Review Your Loan Plan</h2>
            {formData.loanDetails && (() => {
                const snapshot = buildLoanReviewSnapshot();
                if (!snapshot) return null;
                return (
                    <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg mb-6">
                        <h3 className="font-bold text-gray-800 mb-4">Loan Summary</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span>1. <span className="font-semibold">Initial Deposit{snapshot.depositPercent ? ` (${snapshot.depositPercent}%)` : ''} + Total Administrative Fees</span></span>
                                <span className="font-bold">₦{new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(snapshot.upfrontDepositTotal || 0)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>2. Total Loan Amount</span>
                                <span>₦{new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(snapshot.totalLoanAmount || 0)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>
                                    3. Total Interest Amount
                                    {snapshot.interestRate != null && snapshot.tenor
                                        ? ` (${snapshot.interestRate}% × ${snapshot.tenor} mo)`
                                        : snapshot.interestRate != null
                                        ? ` (${snapshot.interestRate}% of loan)`
                                        : ''}
                                </span>
                                <span>₦{new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(snapshot.totalInterestAmount || 0)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>4. Total Repayment Amount</span>
                                <span>₦{new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(snapshot.totalRepaymentAmount || 0)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>5. <span className="font-semibold">Monthly Repayment Amount</span></span>
                                <span className="font-bold">₦{new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(snapshot.monthlyRepaymentAmount || 0)}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2 mt-2">
                                <span>6. Loan Tenor</span>
                                <span className="font-bold text-[#273e8e]">{snapshot.tenor} months</span>
                            </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-blue-200">
                            <h4 className="font-semibold text-gray-800 mb-2">Administrative Fees</h4>
                            <p className="text-xs text-gray-600 mb-2">
                                Insurance is calculated on the bundle price only. Management and legal fees are calculated on the loan amount.
                            </p>
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                    <span>1. Insurance Fee ({snapshot.insurancePct}% of bundle price)</span>
                                    <span className="font-medium">₦{new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(snapshot.insuranceFee || 0)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>2. Management Fee ({snapshot.managementPct}% of the loan amount)</span>
                                    <span className="font-medium">₦{new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(snapshot.managementFee || 0)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>3. Legal Fee ({snapshot.legalPct}% of the loan amount)</span>
                                    <span className="font-medium">₦{new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(snapshot.legalFee || 0)}</span>
                                </div>
                                <div className="flex justify-between font-semibold border-t border-blue-200 pt-1 mt-1">
                                    <span>Total Administrative Fees</span>
                                    <span>₦{new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(snapshot.feesTotal || 0)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
            <p className="text-gray-600 mb-6">
                Do you want to proceed with this loan plan? You'll need to complete a credit check and provide additional information.
            </p>
            <div className="flex gap-4">
                <button
                    onClick={() => {
                        const snapshot = buildLoanReviewSnapshot();
                        if (!snapshot) {
                            alert('Loan plan is incomplete. Please adjust and try again.');
                            return;
                        }
                        setFormData(prev => ({
                            ...prev,
                            loanDetails: {
                                ...prev.loanDetails,
                                bundlePrice: snapshot.bundlePrice,
                                totalAmount: snapshot.totalAmount,
                                baseDepositAmount: snapshot.depositAmount,
                                depositAmount: snapshot.upfrontDepositTotal,
                                principal: snapshot.totalLoanAmount,
                                totalLoanAmount: snapshot.totalLoanAmount,
                                totalInterestAmount: snapshot.totalInterestAmount,
                                totalInterest: snapshot.totalInterestAmount,
                                totalRepaymentAmount: snapshot.totalRepaymentAmount,
                                totalRepayment: snapshot.totalRepaymentAmount,
                                monthlyRepaymentAmount: snapshot.monthlyRepaymentAmount,
                                monthlyRepayment: snapshot.monthlyRepaymentAmount,
                                insuranceFee: snapshot.insuranceFee,
                                managementFee: snapshot.managementFee,
                                legalFee: snapshot.legalFee,
                                adminFeesTotal: snapshot.feesTotal,
                                feePercentages: {
                                    insurance: snapshot.insurancePct,
                                    management: snapshot.managementPct,
                                    legal: snapshot.legalPct,
                                },
                            }
                        }));
                        setStep(11);
                    }}
                    className="flex-1 bg-[#273e8e] text-white py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors"
                >
                    Yes, Proceed
                </button>
                <button
                    onClick={() => setStep(8)}
                    className="flex-1 border-2 border-gray-300 text-gray-700 py-4 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                >
                    Adjust Plan
                </button>
            </div>
        </div>
    );

    const processMonoCreditCheck = async ({ monoCode = null, useLinkedAccount = false }) => {
        const token = localStorage.getItem('access_token');
        setProcessingCreditCheckPayment(true);

        const loanPrincipal = formData.loanDetails?.principal
            || formData.loanDetails?.totalLoanAmount
            || formData.loanDetails?.totalRepayment
            || 0;

        const payload = {
            bvn: formData.bvn,
            loan_amount: loanPrincipal,
            repayment_duration: formData.loanDetails?.tenor || 6,
            loan_plan_snapshot: formData.loanDetails || null,
        };

        if (useLinkedAccount) {
            payload.use_linked_account = true;
        } else {
            payload.mono_code = monoCode;
        }

        const initiateResponse = await axios.post(
            API.BNPL_PROCESS_CREDIT_CHECK,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
            }
        );

        const sessionId = initiateResponse.data?.data?.session_id;
        if (!sessionId) {
            throw new Error('Credit check session was not created.');
        }

        setMonoCreditSessionId(sessionId);
        setFormData((prev) => ({
            ...prev,
            creditCheckMethod: 'auto',
        }));

        const fakeEvent = { preventDefault: () => {} };
        await submitApplication(fakeEvent, sessionId);
        setProcessingCreditCheckPayment(false);
    };

    const handleMonoCreditCheckError = async (error) => {
        console.error('Credit check processing error:', error);
        const errorMsg = error.response?.data?.message || error.message || 'Credit check processing failed';
        setProcessingCreditCheckPayment(false);

        const useManual = confirm(`${errorMsg}\n\nWould you like to proceed with manual credit check review instead?`);
        if (useManual) {
            setMonoFailed(true);
            setFormData((prev) => ({ ...prev, creditCheckMethod: 'manual' }));
            setCreditCheckPhase('manual_upload');
        }
    };

    const getCreditCheckFee = () => Number(loanConfig?.credit_check_fee) || DEFAULT_CREDIT_CHECK_FEE;

    const afterCreditCheckFeePaid = async () => {
        setCreditCheckFeePaid(true);
        const isManual = formData.creditCheckMethod === 'manual' || monoFailed;
        if (isManual) {
            setCreditCheckPhase('manual_upload');
            setProcessingCreditCheckPayment(false);
            return;
        }
        setCreditCheckPhase('processing');
        try {
            await proceedWithAutoCreditCheck();
        } catch (error) {
            await handleMonoCreditCheckError(error);
        }
    };

    const verifyMonoFeePayment = async (reference = monoFeePaymentReference) => {
        if (!reference) {
            alert('No Mono payment reference found. Please start payment again.');
            return false;
        }
        const token = localStorage.getItem('access_token');
        setProcessingCreditCheckPayment(true);
        try {
            const response = await axios.post(
                API.BNPL_CREDIT_CHECK_FEE_MONO_VERIFY,
                { reference },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                }
            );
            if (response.data?.data?.paid) {
                setMonoFeePaymentReference(reference);
                await afterCreditCheckFeePaid();
                return true;
            }
            alert(response.data?.message || 'Payment not completed yet. Finish payment in Mono, then try again.');
            return false;
        } catch (error) {
            alert(error.response?.data?.message || error.message || 'Could not verify Mono payment.');
            return false;
        } finally {
            setProcessingCreditCheckPayment(false);
        }
    };

    const advanceFromMethodChoice = () => {
        if (!formData.creditCheckMethod) {
            alert('Please choose how you would like to complete your credit check.');
            return;
        }
        setMonoFailed(false);
        if (formData.creditCheckMethod === 'auto') {
            if (skipCreditCheckFee && userMonoAccount?.linked) {
                proceedWithAutoCreditCheck();
                return;
            }
            if (userMonoAccount?.linked && !skipCreditCheckFee) {
                setCreditCheckPhase('pay_fee');
                return;
            }
            setCreditCheckPhase('mono_link');
            return;
        }
        if (skipCreditCheckFee) {
            setCreditCheckPhase('manual_upload');
            return;
        }
        setCreditCheckPhase('pay_fee');
    };

    const openMonoConnectForLinking = async () => {
        try {
            setProcessingCreditCheckPayment(true);
            stopCamera();

            const handleMonoSuccess = async (widgetPayload) => {
                const code = typeof widgetPayload === 'string'
                    ? widgetPayload
                    : (widgetPayload?.code || widgetPayload?.auth_code);
                if (!code) {
                    alert('Mono did not return an authorization code.');
                    setProcessingCreditCheckPayment(false);
                    return;
                }

                try {
                    const linked = await linkMonoAccountFromCode(code);
                    setUserMonoAccount({
                        linked: true,
                        bank_label: linked?.bank_label,
                        mono_account_id: linked?.mono_account_id,
                        linked_at: linked?.linked_at,
                    });
                    if (skipCreditCheckFee) {
                        setCreditCheckPhase('processing');
                        await proceedWithAutoCreditCheck();
                    } else {
                        setCreditCheckPhase('pay_fee');
                        setProcessingCreditCheckPayment(false);
                    }
                } catch (error) {
                    alert(error?.response?.data?.message || error.message || 'Failed to link bank account');
                    setProcessingCreditCheckPayment(false);
                }
            };

            await openMonoConnectWidget({
                customerName: formData.fullName || '',
                customerEmail: formData.email || '',
                referencePrefix: 'troosolar_bnpl_link',
                existingInstance: monoConnectInstance,
                onInstance: setMonoConnectInstance,
                prepareCamera: true,
                onSuccess: handleMonoSuccess,
                onClose: () => {
                    setProcessingCreditCheckPayment(false);
                },
            });
        } catch (error) {
            console.error('Failed to initialize Mono Connect:', error);
            alert(error.message || 'Failed to open bank connection. Try again or choose manual review.');
            setProcessingCreditCheckPayment(false);
        }
    };

    const proceedWithAutoCreditCheck = async () => {
        setMonoFailed(false);
        if (!userMonoAccount?.linked) {
            setCreditCheckPhase('mono_link');
            return;
        }
        try {
            setProcessingCreditCheckPayment(true);
            setCreditCheckPhase('processing');
            await processMonoCreditCheck({ useLinkedAccount: true });
        } catch (error) {
            await handleMonoCreditCheckError(error);
        }
    };

    const handleCreditCheckFeeFlutterwave = async () => {
        if (!formData.loanDetails?.principal) {
            alert("Loan details not found. Please go back and complete the loan calculator.");
            return;
        }

        const creditCheckFee = getCreditCheckFee();
        setProcessingCreditCheckPayment(true);

        try {
            await ensureFlutterwave();

            const txRef = "credit_check_" + Date.now();
            const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
            const userEmail = userInfo.email || userInfo.user?.email || userInfo.data?.email || 'customer@troosolar.com';
            const userName = userInfo.name || userInfo.full_name || userInfo.user?.name || userInfo.data?.name || 'Customer';

            window.FlutterwaveCheckout({
                public_key: FLUTTERWAVE_PUBLIC_KEY,
                tx_ref: txRef,
                amount: creditCheckFee,
                currency: "NGN",
                payment_options: "card,ussd,banktransfer",
                customer: {
                    email: userEmail,
                    name: userName,
                },
                callback: async (response) => {
                    if (response?.status === "successful") {
                        dismissFlutterwaveOverlay();
                        await new Promise(resolve => setTimeout(resolve, 800));
                        dismissFlutterwaveOverlay();
                        setShowCreditCheckFeeModal(false);
                        await afterCreditCheckFeePaid();
                    } else {
                        alert("Payment was not successful. Please try again.");
                        setProcessingCreditCheckPayment(false);
                    }
                },
                onclose: () => {
                    setProcessingCreditCheckPayment(false);
                },
            });
        } catch (error) {
            console.error("Payment initialization error:", error);
            alert("Failed to initialize payment. Please try again.");
            setProcessingCreditCheckPayment(false);
        }
    };

    const handleCreditCheckFeeMonoPay = async () => {
        if (!acceptedTerms) {
            alert("Please accept the terms and conditions to proceed.");
            return;
        }
        if (!userMonoAccount?.linked) {
            alert("Please link your bank account with Mono first.");
            return;
        }

        setProcessingCreditCheckPayment(true);
        try {
            const token = localStorage.getItem('access_token');
            const response = await axios.post(
                API.BNPL_CREDIT_CHECK_FEE_MONO_INITIATE,
                {},
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/json',
                    },
                }
            );

            const paymentUrl = response.data?.data?.payment_url;
            const reference = response.data?.data?.reference;
            if (!paymentUrl || !reference) {
                throw new Error(response.data?.message || 'Could not start Mono payment.');
            }

            setMonoFeePaymentReference(reference);
            setShowCreditCheckFeeModal(false);
            window.open(paymentUrl, '_blank', 'noopener,noreferrer');
            alert(`A Mono window will open to authorize a one-time debit from your linked bank account. When finished, return here and tap "I've completed the bank debit".`);
        } catch (error) {
            alert(error.response?.data?.message || error.message || 'Failed to start Mono payment.');
        } finally {
            setProcessingCreditCheckPayment(false);
        }
    };

    const handleCreditCheckPayment = async () => {
        await handleCreditCheckFeeFlutterwave();
    };

    React.useEffect(() => {
        const monoFeeRef = searchParams.get('mono_fee_ref');
        if (step !== 10 || !monoFeeRef || creditCheckFeePaid) return;
        setMonoFeePaymentReference(monoFeeRef);
        setCreditCheckPhase('pay_fee');
        verifyMonoFeePayment(monoFeeRef);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, searchParams]);

    const renderManualUploadSection = () => (
        <div className="space-y-4 mb-6">
            <h3 className="text-lg font-bold text-gray-800 border-b pb-2">Required Documents</h3>
            {monoFailed && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-yellow-800 font-medium">
                        <strong>Note:</strong> Automatic credit check was unsuccessful. Please upload the required documents for manual review.
                    </p>
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bank Statement (Last 6 Months) <span className="text-red-500">*</span>
                </label>
                <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                            if (file.size > 10 * 1024 * 1024) {
                                alert("Bank statement file size must be less than 10MB");
                                e.target.value = '';
                                return;
                            }
                            setFormData(prev => ({ ...prev, bankStatement: file }));
                        }
                    }}
                    required
                    className="w-full p-3 border rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#273e8e] file:text-white hover:file:bg-[#1a2b6b]"
                />
                {formData.bankStatement && (
                    <p className="text-sm text-green-600 mt-1">
                        ✓ {formData.bankStatement.name}
                    </p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                    Accepted formats: PDF, JPG, PNG (Max 10MB)
                </p>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Live Photo / Selfie <span className="text-red-500">*</span>
                </label>

                {cameraStream ? (
                    <div className="relative rounded-lg overflow-hidden border-2 border-[#273e8e] mb-2">
                        <video
                            ref={cameraVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-64 object-cover bg-black"
                        />
                        <canvas ref={cameraCanvasRef} className="hidden" />
                        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
                            <button
                                type="button"
                                onClick={captureLivePhoto}
                                className="bg-white text-[#273e8e] rounded-full p-3 shadow-lg hover:bg-gray-100 transition-colors border-2 border-[#273e8e]"
                                title="Capture Photo"
                            >
                                <Camera size={28} />
                            </button>
                            <button
                                type="button"
                                onClick={stopCamera}
                                className="bg-red-500 text-white rounded-full p-3 shadow-lg hover:bg-red-600 transition-colors"
                                title="Close Camera"
                            >
                                <X size={28} />
                            </button>
                        </div>
                    </div>
                ) : formData.livePhoto ? (
                    <div className="relative rounded-lg overflow-hidden border border-green-300 bg-green-50 mb-2">
                        <img
                            src={formData.livePhotoPreview || URL.createObjectURL(formData.livePhoto)}
                            alt="Live Photo Preview"
                            className="w-full h-64 object-cover"
                        />
                        <div className="absolute top-2 right-2 flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setFormData(prev => ({ ...prev, livePhoto: null, livePhotoPreview: null }));
                                }}
                                className="bg-red-500 text-white rounded-full p-1.5 shadow hover:bg-red-600"
                                title="Remove Photo"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <p className="text-sm text-green-700 font-medium p-2 text-center">
                            ✓ Live photo captured
                        </p>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={openCamera}
                        className="w-full p-6 border-2 border-dashed border-[#273e8e] rounded-lg bg-[#273e8e]/5 hover:bg-[#273e8e]/10 transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer"
                    >
                        <Camera size={40} className="text-[#273e8e]" />
                        <span className="text-[#273e8e] font-semibold">Tap to Open Camera & Take Selfie</span>
                        <span className="text-xs text-gray-500">Your camera will open to capture a live photo</span>
                    </button>
                )}

                {cameraError && (
                    <p className="text-sm text-red-500 mt-1">{cameraError}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                    A live selfie is required for identity verification.
                </p>
            </div>
        </div>
    );

    const renderCreditCheckFeeSection = () => {
        const creditCheckFee = getCreditCheckFee();
        const canDebitLinkedBank = formData.creditCheckMethod === 'auto' && userMonoAccount?.linked;
        const linkedBankLabel = userMonoAccount?.bank_label || 'your linked bank account';

        return (
            <div className="space-y-6">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
                    <p className="text-sm text-blue-800 font-medium">
                        Pay the verification fee before we run your credit check
                        {formData.creditCheckMethod === 'manual' ? ' and review your documents' : ''}.
                    </p>
                    {canDebitLinkedBank && (
                        <p className="text-sm text-blue-700">
                            Recommended: debit ₦{creditCheckFee.toLocaleString()} directly from {linkedBankLabel}.
                            No card needed — you authorize the one-time debit in Mono.
                        </p>
                    )}
                    <p className="text-xs text-blue-600">
                        Prefer card or bank transfer? Use the payment option below.
                    </p>
                </div>

                {(() => {
                    const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
                    const userEmail = userInfo.email || userInfo.user?.email || userInfo.data?.email || '';
                    return userEmail ? (
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <p className="text-xs text-gray-500 mb-1">Payment will be processed for:</p>
                            <p className="text-sm font-semibold text-gray-800">{userEmail}</p>
                        </div>
                    ) : null;
                })()}

                <div className="text-center">
                    <p className="text-sm text-gray-600 mb-2">Credit Check Fee</p>
                    <p className="text-3xl font-bold text-[#273e8e]">
                        ₦{creditCheckFee.toLocaleString()}
                    </p>
                </div>

                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={() => setAcceptedTerms(!acceptedTerms)}
                        className={`mt-1 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            acceptedTerms
                                ? 'bg-[#273e8e] border-[#273e8e]'
                                : 'border-gray-300 hover:border-[#273e8e]'
                        }`}
                    >
                        {acceptedTerms && <CheckCircle size={16} className="text-white" />}
                    </button>
                    <label
                        onClick={() => setAcceptedTerms(!acceptedTerms)}
                        className="text-sm text-gray-700 cursor-pointer flex-1"
                    >
                        I accept the terms and conditions for the credit check fee payment.
                    </label>
                </div>

                <div className="flex flex-col gap-3">
                    {canDebitLinkedBank && (
                        <button
                            type="button"
                            onClick={handleCreditCheckFeeMonoPay}
                            disabled={processingCreditCheckPayment || !acceptedTerms}
                            className={`w-full bg-[#273e8e] text-white py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors ${
                                processingCreditCheckPayment || !acceptedTerms ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                        >
                            {processingCreditCheckPayment
                                ? 'Processing...'
                                : `Debit ₦${creditCheckFee.toLocaleString()} from linked bank`}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={async () => {
                            if (!acceptedTerms) {
                                alert("Please accept the terms and conditions to proceed.");
                                return;
                            }
                            await handleCreditCheckFeeFlutterwave();
                        }}
                        disabled={processingCreditCheckPayment || !acceptedTerms}
                        className={`w-full border-2 border-[#273e8e] text-[#273e8e] py-4 rounded-xl font-bold hover:bg-blue-50 transition-colors ${
                            processingCreditCheckPayment || !acceptedTerms ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                    >
                        {processingCreditCheckPayment
                            ? 'Processing...'
                            : `Pay with card or bank transfer — ₦${creditCheckFee.toLocaleString()}`}
                    </button>
                    {monoFeePaymentReference && (
                        <button
                            type="button"
                            onClick={() => verifyMonoFeePayment()}
                            disabled={processingCreditCheckPayment}
                            className="w-full text-sm text-[#273e8e] underline py-2"
                        >
                            I completed the bank debit — verify payment
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const renderStep10 = () => {
        const isManualMethod = formData.creditCheckMethod === 'manual' || monoFailed;
        const isAutoMethod = formData.creditCheckMethod === 'auto' && !monoFailed;
        const phase = creditCheckPhase;

        return (
            <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100 relative">
                <button
                    onClick={() => {
                        if (phase === 'choose_method') {
                            setStep(11);
                        } else if (phase === 'mono_link') {
                            setCreditCheckPhase('choose_method');
                        } else if (phase === 'pay_fee') {
                            setCreditCheckPhase(isAutoMethod ? 'mono_link' : 'choose_method');
                        } else if (phase === 'manual_upload') {
                            if (creditCheckFeePaid || skipCreditCheckFee) {
                                setCreditCheckPhase(skipCreditCheckFee ? 'choose_method' : 'pay_fee');
                            } else {
                                setCreditCheckPhase('choose_method');
                            }
                        } else {
                            setCreditCheckPhase('choose_method');
                        }
                    }}
                    className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]"
                >
                    <ArrowLeft size={16} className="mr-2" /> Back
                </button>
                <h2 className="text-2xl font-bold mb-2 text-[#273e8e]">Credit Check</h2>

                {skipCreditCheckFee && phase === 'choose_method' && (
                    <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
                        <p className="text-sm text-green-800 font-medium">
                            Re-application detected: your credit check fee is waived for this submission.
                        </p>
                    </div>
                )}

                {(processingCreditCheckPayment || phase === 'processing') && (
                    <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <p className="text-sm text-blue-800 font-medium">
                            {phase === 'processing'
                                ? 'Running your credit verification and submitting your application...'
                                : 'Please wait...'}
                        </p>
                    </div>
                )}

                {phase === 'choose_method' && (
                    <>
                        <p className="text-gray-600 mb-6">Choose how you would like to complete your credit check.</p>
                        <div className="grid gap-4 mb-6 md:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setMonoFailed(false);
                                    setFormData((prev) => ({ ...prev, creditCheckMethod: 'auto' }));
                                }}
                                className={`p-6 rounded-xl border-2 text-left transition-colors ${
                                    isAutoMethod
                                        ? 'border-[#273e8e] bg-blue-50'
                                        : 'border-gray-200 hover:border-[#273e8e]/50'
                                }`}
                            >
                                <div className="flex items-center mb-2">
                                    <CheckCircle size={20} className="text-[#273e8e]" />
                                    <span className="ml-2 font-bold text-gray-800">Connect your bank (Recommended)</span>
                                </div>
                                <p className="text-sm ml-7 text-gray-500">
                                    Link your account with Mono, pay the verification fee, then we run the credit check automatically.
                                </p>
                            </button>

                            <button
                                type="button"
                                onClick={() => setFormData((prev) => ({ ...prev, creditCheckMethod: 'manual' }))}
                                className={`p-6 rounded-xl border-2 text-left transition-colors ${
                                    isManualMethod
                                        ? 'border-[#273e8e] bg-blue-50'
                                        : 'border-gray-200 hover:border-[#273e8e]/50'
                                }`}
                            >
                                <div className="flex items-center mb-2">
                                    <CheckCircle size={20} className="text-[#273e8e]" />
                                    <span className="ml-2 font-bold text-gray-800">Manual review</span>
                                </div>
                                <p className="text-sm ml-7 text-gray-500">
                                    Pay the verification fee first, then upload your bank statement and selfie.
                                </p>
                            </button>
                        </div>

                        <button
                            onClick={advanceFromMethodChoice}
                            disabled={loading || processingCreditCheckPayment || !formData.creditCheckMethod}
                            className={`w-full py-4 rounded-xl font-bold transition-colors ${
                                loading || processingCreditCheckPayment || !formData.creditCheckMethod
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
                            }`}
                        >
                            Continue
                        </button>
                    </>
                )}

                {phase === 'mono_link' && (
                    <>
                        <p className="text-gray-600 mb-6">
                            Step 1 of 3: Link your bank with Mono. Credit verification starts only after you pay the fee.
                        </p>

                        {userMonoAccount?.linked ? (
                            <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
                                <p className="text-sm text-green-800 font-medium">
                                    Bank connected
                                    {userMonoAccount.bank_label ? `: ${userMonoAccount.bank_label}` : ''}.
                                </p>
                                <Link to="/more?section=bankAccount" className="text-sm text-[#273e8e] underline mt-2 inline-block">
                                    Change bank in More → Bank Account
                                </Link>
                            </div>
                        ) : (
                            <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
                                <p className="text-sm text-blue-800">
                                    Connect your bank securely with Mono. This step only links your account — no credit check yet.
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col gap-3">
                            {!userMonoAccount?.linked && (
                                <button
                                    type="button"
                                    onClick={openMonoConnectForLinking}
                                    disabled={processingCreditCheckPayment || loadingUserMonoAccount}
                                    className="w-full bg-[#273e8e] text-white py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors disabled:opacity-50"
                                >
                                    {processingCreditCheckPayment ? 'Connecting...' : 'Link bank with Mono'}
                                </button>
                            )}
                            {userMonoAccount?.linked && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (skipCreditCheckFee) {
                                            proceedWithAutoCreditCheck();
                                        } else {
                                            setCreditCheckPhase('pay_fee');
                                        }
                                    }}
                                    disabled={processingCreditCheckPayment}
                                    className="w-full bg-[#273e8e] text-white py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors disabled:opacity-50"
                                >
                                    {skipCreditCheckFee ? 'Continue (fee waived)' : 'Continue to verification fee'}
                                </button>
                            )}
                        </div>
                    </>
                )}

                {phase === 'pay_fee' && !skipCreditCheckFee && (
                    <>
                        <p className="text-gray-600 mb-6">
                            {isAutoMethod
                                ? 'Step 2 of 3: Pay the verification fee from your linked bank or online (card or bank transfer). Credit check runs only after payment.'
                                : 'Pay the verification fee before uploading your documents.'}
                        </p>
                        {renderCreditCheckFeeSection()}
                    </>
                )}

                {phase === 'manual_upload' && (
                    <>
                        <p className="text-gray-600 mb-6">
                            {creditCheckFeePaid || skipCreditCheckFee
                                ? 'Upload your documents for manual credit review.'
                                : 'Complete payment first to unlock document upload.'}
                        </p>
                        {(creditCheckFeePaid || skipCreditCheckFee) && renderManualUploadSection()}

                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                if (!formData.bankStatement) {
                                    alert("Please upload your bank statement (Last 6 Months)");
                                    return;
                                }
                                if (!formData.livePhoto) {
                                    alert("Please upload your live photo / selfie");
                                    return;
                                }
                                const fakeEvent = { preventDefault: () => {} };
                                submitApplication(fakeEvent);
                            }}
                            disabled={
                                loading
                                || processingCreditCheckPayment
                                || (!creditCheckFeePaid && !skipCreditCheckFee)
                                || !formData.bankStatement
                                || !formData.livePhoto
                            }
                            className={`w-full py-4 rounded-xl font-bold transition-colors mt-6 ${
                                loading
                                || processingCreditCheckPayment
                                || (!creditCheckFeePaid && !skipCreditCheckFee)
                                || !formData.bankStatement
                                || !formData.livePhoto
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
                            }`}
                        >
                            {loading || processingCreditCheckPayment ? 'Submitting Application...' : 'Submit for Manual Review'}
                        </button>
                    </>
                )}

                {/* Legacy modal kept for any external triggers */}
                {showCreditCheckFeeModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => {
                    setShowCreditCheckFeeModal(false);
                    setAcceptedTerms(false);
                }}>
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-bold text-[#273e8e]">Credit Check Fee</h3>
                            <button
                                onClick={() => {
                                    setShowCreditCheckFeeModal(false);
                                    setAcceptedTerms(false);
                                }}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        {renderCreditCheckFeeSection()}
                    </div>
                </div>
                )}
            </div>
        );
    };

    const submitApplication = async (e, monoSessionIdOverride = null) => {
        if (e && e.preventDefault) {
        e.preventDefault();
        }
        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                alert("Please login to continue");
                navigate('/login');
                return;
            }

            // Validate required fields
            if (!formData.customerType || formData.customerType.trim() === '') {
                alert("Customer type is required. Please go back and select a customer type.");
                setLoading(false);
                return;
            }

            // Step 1: Create loan calculation first (required by backend)
            // NEW: Calculate total from all selected items (accounting for quantity)
            const bundlesTotal = formData.selectedBundles.reduce((sum, b) => sum + (b.price * (b.quantity || 1)), 0);
            const productsTotal = formData.selectedProducts.reduce((sum, p) => sum + (p.price * (p.quantity || 1)), 0);
            const itemsSubtotal = bundlesTotal + productsTotal;
            const basePrice = itemsSubtotal > 0 ? itemsSubtotal : formData.selectedProductPrice;
            
            let loanCalculationId = null;
            if (formData.loanDetails) {
                try {
                    const loanCalcPayload = {
                        product_amount: basePrice, // NEW: Use total of all selected items
                        loan_amount: formData.loanDetails.totalRepayment,
                        repayment_duration: formData.loanDetails.tenor
                    };
                    
                    const loanCalcResponse = await axios.post(API.LOAN_CALCULATION, loanCalcPayload, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            Accept: 'application/json'
                        }
                    });

                    if (loanCalcResponse.data?.data?.id) {
                        loanCalculationId = loanCalcResponse.data.data.id;
                    } else if (loanCalcResponse.data?.id) {
                        loanCalculationId = loanCalcResponse.data.id;
                    }
                } catch (calcError) {
                    console.error("Loan calculation error:", calcError);
                    // Continue anyway - backend might handle it differently
                }
            }

            // Step 2: Submit BNPL application
            const formDataToSend = new FormData();

            // Basic Fields - Ensure customer_type is not empty
            const customerType = formData.customerType || 'residential'; // Default to residential if empty
            formDataToSend.append('customer_type', customerType);
            formDataToSend.append('product_category', formData.productCategory || 'full-kit');
            formDataToSend.append('loan_amount', formData.loanDetails?.totalRepayment || formData.selectedProductPrice);
            formDataToSend.append('repayment_duration', formData.loanDetails?.tenor || 6);
            formDataToSend.append('credit_check_method', formData.creditCheckMethod || 'manual');
            if (reapplyPriorApplicationId && Number.isFinite(Number(reapplyPriorApplicationId))) {
                formDataToSend.append('prior_application_id', String(reapplyPriorApplicationId));
            }
            if (formData.loanDetails) {
                try {
                    formDataToSend.append('loan_plan_snapshot', JSON.stringify(formData.loanDetails));
                } catch (e) {
                    console.error('loan_plan_snapshot', e);
                }
            }
            
            // Add loan calculation ID if available
            if (loanCalculationId) {
                formDataToSend.append('loan_calculation_id', loanCalculationId);
            }

            // Personal Details
            formDataToSend.append('personal_details[full_name]', formData.fullName);
            formDataToSend.append('personal_details[bvn]', formData.bvn);
            formDataToSend.append('personal_details[phone]', formData.phone);
            formDataToSend.append('personal_details[email]', formData.email);
            formDataToSend.append('personal_details[social_media]', formData.socialMedia || '');

            // Property Details - Always send all fields (backend requires estate fields when property_details is present)
            formDataToSend.append('property_details[state]', formData.state || '');
            formDataToSend.append('property_details[address]', formData.address || '');
            formDataToSend.append('property_details[landmark]', formData.landmark || '');
            formDataToSend.append('property_details[floors]', formData.floors || '');
            formDataToSend.append('property_details[rooms]', formData.rooms || '');
            formDataToSend.append('property_details[is_gated_estate]', formData.isGatedEstate ? 1 : 0);
            // Always send estate fields (required by backend when property_details is present)
            formDataToSend.append('property_details[estate_name]', formData.isGatedEstate ? (formData.estateName || '') : '');
            formDataToSend.append('property_details[estate_address]', formData.isGatedEstate ? (formData.estateAddress || '') : '');
            
            // Add state_id and add_on_ids if available
            if (formData.stateId) formDataToSend.append('state_id', formData.stateId);
            
            // NEW: Add multiple bundle IDs if selected (repeat id by quantity so order shows all items)
            if (formData.selectedBundles.length > 0) {
                formData.selectedBundles.forEach((bundle) => {
                    const qty = Math.max(1, Number(bundle.quantity) || 1);
                    for (let i = 0; i < qty; i++) {
                        formDataToSend.append('bundle_ids[]', bundle.id);
                    }
                });
            } else if (formData.selectedBundleId) {
                // OLD: Fallback to single bundle ID for backward compatibility
                formDataToSend.append('bundle_id', formData.selectedBundleId);
            }
            
            // NEW: Add multiple product IDs if selected (repeat id by quantity so order shows all items)
            if (formData.selectedProducts.length > 0) {
                formData.selectedProducts.forEach((product) => {
                    const qty = Math.max(1, Number(product.quantity) || 1);
                    for (let i = 0; i < qty; i++) {
                        formDataToSend.append('product_ids[]', product.id);
                    }
                });
            } else if (formData.selectedProductId) {
                // OLD: Fallback to single product ID for backward compatibility
                formDataToSend.append('product_id', formData.selectedProductId);
            }
            
            // Add compulsory BNPL add-ons (Insurance)
            const compulsoryAddOns = addOns.filter(a => a.is_compulsory_bnpl).map(a => a.id);
            if (compulsoryAddOns.length > 0) {
                compulsoryAddOns.forEach(id => formDataToSend.append('add_on_ids[]', id));
            }

            // Files - Only required for manual credit check or when Mono has failed
            if ((formData.creditCheckMethod === 'manual' || monoFailed) && !skipCreditCheckFee) {
                if (!formData.bankStatement || !formData.livePhoto) {
                    alert("Bank statement and live photo are required for manual credit check. Please upload both documents.");
                    setLoading(false);
                    return;
                }
                formDataToSend.append('bank_statement', formData.bankStatement);
                formDataToSend.append('live_photo', formData.livePhoto);
            }
            // For automatic (Mono) credit check, files are not required
            const activeMonoSessionId = monoSessionIdOverride || monoCreditSessionId;
            if (formData.creditCheckMethod === 'auto' && activeMonoSessionId) {
                formDataToSend.append('mono_credit_session_id', String(activeMonoSessionId));
            }

            const response = await axios.post(API.BNPL_APPLY, formDataToSend, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (response.data.status === 'success') {
                setApplicationId(response.data.data.loan_application.id);
                const appStatus = response.data.data.loan_application.status;
                setApplicationStatus(appStatus);
                setSkipCreditCheckFee(false);
                setReapplyPriorApplicationId(null);
                try {
                    sessionStorage.removeItem('bnpl_reapply_prior_application_id');
                    sessionStorage.removeItem('bnpl_skip_credit_check_fee');
                } catch {}
                
                // If application is already approved, go directly to invoice (step 21)
                // Otherwise, go to pending status (step 12)
                if (appStatus === 'approved') {
                    setStep(21); // Go to invoice/payment screen
                } else {
                    setStep(12); // Go to Status/Pending screen
                }
            }
        } catch (error) {
            console.error("Application Submit Error:", error);
            const errorMessage = error.response?.data?.message || 
                                (error.response?.data?.errors ? JSON.stringify(error.response.data.errors) : null) ||
                                "Failed to submit application. Please check all required fields.";
            alert(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const renderStep11 = () => (
        <div className="animate-fade-in max-w-4xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <button onClick={() => setStep(9)} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
                <ArrowLeft size={16} className="mr-2" /> Back
            </button>
            <h2 className="text-2xl font-bold mb-6 text-[#273e8e]">Final Application</h2>
            <form onSubmit={(e) => {
                e.preventDefault();
                // Validate required fields before proceeding to credit check
                // Note: bankStatement and livePhoto removed - no longer required (handled via Mono)
                if (!formData.fullName || !formData.bvn || !formData.phone || !formData.email || !formData.socialMedia || 
                    !formData.state || !formData.address) {
                    alert("Please fill in all required fields");
                    return;
                }
                if (!isValidSocialMediaIdentity(formData.socialMedia)) {
                    alert("Please enter a verifiable social media identity (Instagram @handle or Facebook/Instagram profile link).");
                    return;
                }
                if (formData.isGatedEstate && (!formData.estateName || !formData.estateAddress)) {
                    alert("Please fill in Estate Name and Estate Address");
                    return;
                }
                setStep(10); // Go to credit check method selection
            }} className="space-y-6">
                {/* Personal Details Section */}
                <div>
                    <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Personal Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" placeholder="Full Name" required className="p-3 border rounded-lg" onChange={e => setFormData({ ...formData, fullName: e.target.value })} />
                        <input type="text" placeholder="BVN" required className="p-3 border rounded-lg" onChange={e => setFormData({ ...formData, bvn: e.target.value })} />
                        <input type="tel" placeholder="Phone Number" required className="p-3 border rounded-lg" onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                        <input type="email" placeholder="Email Address" required className="p-3 border rounded-lg" onChange={e => setFormData({ ...formData, email: e.target.value })} />
                        <div className="col-span-2">
                            <input 
                                type="text" 
                                placeholder="Social Media Handle *" 
                                required 
                                className="w-full p-3 border rounded-lg" 
                                value={formData.socialMedia}
                                onChange={e => setFormData({ ...formData, socialMedia: e.target.value })} 
                            />
                            <p className="text-xs text-gray-500 mt-1">Social media handle is required for verification (e.g., Instagram handle or Facebook username).</p>
                            {formData.socialMedia && formData.socialMedia.trim().length === 0 && (
                                <p className="text-xs text-red-600 mt-1">Social media handle cannot be empty</p>
                            )}
                            {formData.socialMedia && formData.socialMedia.trim().length > 0 && !isValidSocialMediaIdentity(formData.socialMedia) && (
                                <p className="text-xs text-red-600 mt-1">Provide a verifiable handle: @username or a full Instagram/Facebook profile link.</p>
                            )}
                            {isValidSocialMediaIdentity(formData.socialMedia) && (
                                <a
                                    href={getSocialMediaVerificationUrl(formData.socialMedia)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block text-xs text-[#273e8e] mt-1 underline"
                                >
                                    Verify profile link
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* Property Details Section */}
                <div>
                    <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Property Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {states.length > 0 ? (
                            <select
                                required
                                className="p-3 border rounded-lg"
                                onChange={e => {
                                    const stateId = e.target.value ? Number(e.target.value) : null;
                                    const selectedState = states.find(s => s.id === stateId);
                                    setFormData({ ...formData, state: selectedState?.name || '', stateId });
                                }}
                            >
                                <option value="">Select State</option>
                                {states.filter(s => s.is_active).map((state) => (
                                    <option key={state.id} value={state.id}>{state.name}</option>
                                ))}
                            </select>
                        ) : (
                            <input type="text" placeholder="State" required className="p-3 border rounded-lg" onChange={e => setFormData({ ...formData, state: e.target.value })} />
                        )}
                        <input type="text" placeholder="Address" required className="p-3 border rounded-lg" onChange={e => setFormData({ ...formData, address: e.target.value })} />
                        <input type="text" placeholder="e.g., grid, diesel generator(kVA), inverter(kVA/kW)" className="p-3 border rounded-lg" onChange={e => setFormData({ ...formData, landmark: e.target.value })} />
                        <input type="number" placeholder="Floors" className="p-3 border rounded-lg" onChange={e => setFormData({ ...formData, floors: e.target.value })} />
                        <input type="number" placeholder="Rooms" className="p-3 border rounded-lg" onChange={e => setFormData({ ...formData, rooms: e.target.value })} />
                    </div>
                    <div className="mt-4">
                        <label className="flex items-center space-x-2">
                            <input type="checkbox" checked={formData.isGatedEstate} onChange={e => setFormData({ ...formData, isGatedEstate: e.target.checked })} />
                            <span>Is this in a gated estate?</span>
                        </label>
                    </div>
                    {formData.isGatedEstate && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <input 
                                type="text" 
                                placeholder="Estate Name *" 
                                required={formData.isGatedEstate}
                                className="p-3 border rounded-lg" 
                                onChange={e => setFormData({ ...formData, estateName: e.target.value })} 
                            />
                            <input 
                                type="text" 
                                placeholder="Estate Address *" 
                                required={formData.isGatedEstate}
                                className="p-3 border rounded-lg" 
                                onChange={e => setFormData({ ...formData, estateAddress: e.target.value })} 
                            />
                        </div>
                    )}
                </div>

                <button 
                    type="submit" 
                    disabled={loading || (formData.isGatedEstate && (!formData.estateName || !formData.estateAddress))} 
                    className={`w-full py-4 rounded-xl font-bold transition-colors ${
                        loading || (formData.isGatedEstate && (!formData.estateName || !formData.estateAddress))
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
                    }`}
                >
                    Continue to Credit Check
                </button>
                {formData.isGatedEstate && (!formData.estateName || !formData.estateAddress) && (
                    <p className="text-sm text-red-600 mt-2 text-center">
                        Please fill in Estate Name and Estate Address
                    </p>
                )}
            </form>
        </div>
    );

    // Status polling effect for BNPL application
    React.useEffect(() => {
        if (step === 12 && applicationId) {
            const pollInterval = setInterval(async () => {
                try {
                    const token = localStorage.getItem('access_token');
                    const response = await axios.get(API.BNPL_STATUS(applicationId), {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    
                    if (response.data.status === 'success' && response.data.data?.loan_application) {
                        const status = response.data.data.loan_application.status;
                        setApplicationStatus(status);
                        
                        if (status === 'approved') {
                            clearInterval(pollInterval);
                            setStep(13); // Go to approval screen
                        } else if (status === 'rejected') {
                            clearInterval(pollInterval);
                            setStep(14); // Go to rejection screen
                        } else if (status === 'counter_offer') {
                            clearInterval(pollInterval);
                            setStep(15); // Go to counter offer screen
                        }
                    }
                } catch (error) {
                    console.error("Status polling error:", error);
                }
            }, 30000); // Poll every 30 seconds
            
            return () => clearInterval(pollInterval);
        }
    }, [step, applicationId]);

    // Poll audit request status for audit flow (Step 6)
    React.useEffect(() => {
        if (step === 6 && formData.auditRequestId) {
            const pollInterval = setInterval(async () => {
                try {
                    const token = localStorage.getItem('access_token');
                    const response = await axios.get(API.AUDIT_REQUEST_BY_ID(formData.auditRequestId), {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    
                    if (response.data.status === 'success') {
                        const status = response.data.data.status;
                        if (status === 'approved') {
                            clearInterval(pollInterval);
                            // Stay on success screen; audit flows do not continue to order summary / loan calculator.
                        } else if (status === 'rejected') {
                            clearInterval(pollInterval);
                            alert("Your audit request has been rejected. Please contact support for more information.");
                        }
                    }
                } catch (error) {
                    console.error("Audit status polling error:", error);
                }
            }, 60000); // Poll every 60 seconds for audit requests
            
            return () => clearInterval(pollInterval);
        }
    }, [step, formData.auditRequestId, formData.auditType]);

    const renderStep12 = () => (
        <div className="animate-fade-in max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-8 text-[#273e8e]">Application Submitted</h2>
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-blue-100">
                <Clock size={64} className="text-[#273e8e] mx-auto mb-6 animate-pulse" />
                <p className="text-xl font-medium text-gray-800 mb-4">Your application is under review.</p>
                <p className="text-gray-600 mb-4">We are processing your details. This usually takes 24-72 hours.</p>
                {formData.creditCheckMethod === 'auto' && (
                    <p className="text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-4">
                        Your Mono bank credit check is running in the background. Our team will see the results when ready — you do not need to wait on this screen.
                    </p>
                )}
                <p className="text-sm text-gray-500 mb-8">Status: <span className="font-bold text-[#273e8e]">{applicationStatus}</span></p>
                <div className="flex gap-4 justify-center">
                    <button 
                        onClick={() => {
                            // Navigate to BNPL loans page to view loan details with app- prefix
                            if (applicationId) {
                                navigate(`/bnpl-loans/app-${applicationId}`);
                            } else {
                                navigate('/bnpl-loans');
                            }
                        }} 
                        className="bg-[#273e8e] text-white px-6 py-2 rounded-lg font-bold hover:bg-[#1a2b6b] transition-colors"
                    >
                        Check Status Now
                    </button>
                    <button onClick={() => navigate('/')} className="text-gray-600 px-6 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">
                        Return to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );

    const renderStep13 = () => (
        <div className="animate-fade-in max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-8 text-[#273e8e]">
                Application Status
            </h2>
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-green-200">
                <div className="flex items-center mb-6">
                    <CheckCircle size={32} className="text-green-600 mr-4" />
                    <h3 className="text-2xl font-bold text-green-700">Loan Approved!</h3>
                </div>
                <p className="text-gray-600 mb-8">
                    Congratulations! Your loan application has been approved. Please proceed to download the Guarantor Form.
                </p>
                <button
                    onClick={() => setStep(17)}
                    className="w-full bg-[#273e8e] text-white py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors"
                >
                    Proceed to Guarantor Form
                </button>
            </div>
        </div>
    );

    const renderStep14 = () => (
        <div className="animate-fade-in max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-8 text-[#273e8e]">
                Application Status
            </h2>
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-red-200">
                <div className="flex items-center mb-6">
                    <AlertCircle size={32} className="text-red-600 mr-4" />
                    <h3 className="text-2xl font-bold text-red-700">Loan Not Approved</h3>
                </div>
                <p className="text-gray-600 mb-6">
                    Unfortunately, your loan application was not approved at this time. However, you can improve your chances by:
                </p>
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mb-6">
                    <h4 className="font-bold text-gray-800 mb-3">Options to Improve Your Application:</h4>
                    <ul className="space-y-2 text-sm text-gray-700">
                        <li>• Increase your initial deposit</li>
                        <li>• Extend your repayment duration (if you chose less than 12 months)</li>
                        <li>• Reduce the system size you initially chose</li>
                    </ul>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={() => {
                            // Reset to loan calculator to adjust
                            setStep(8);
                        }}
                        className="flex-1 bg-[#273e8e] text-white py-3 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors"
                    >
                        Adjust Application
                    </button>
                    <button
                        onClick={() => navigate('/')}
                        className="flex-1 border-2 border-gray-300 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                    >
                        Return to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );

    const renderStep15 = () => {
        // This would typically come from the API response
        const counterOffer = {
            minimum_deposit: formData.loanDetails?.depositAmount ? formData.loanDetails.depositAmount * 1.2 : 0,
            minimum_tenor: formData.loanDetails?.tenor ? Math.max(formData.loanDetails.tenor, 12) : 12
        };

        return (
            <div className="animate-fade-in max-w-3xl mx-auto">
                <h2 className="text-3xl font-bold text-center mb-8 text-[#273e8e]">
                    Counter Offer Available
                </h2>
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-yellow-200">
                    <div className="flex items-center mb-6">
                        <AlertCircle size={32} className="text-yellow-600 mr-4" />
                        <h3 className="text-2xl font-bold text-yellow-700">Partial Approval</h3>
                    </div>
                    <p className="text-gray-600 mb-6">
                        Your loan application has been partially approved with a counter offer. Please review the new terms:
                    </p>
                    <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg mb-6">
                        <h4 className="font-bold text-gray-800 mb-4">Counter Offer Terms:</h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span>Minimum Deposit:</span>
                                <span className="font-bold">₦{Number(counterOffer.minimum_deposit).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Minimum Tenor:</span>
                                <span className="font-bold">{counterOffer.minimum_tenor} months</span>
                            </div>
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 mb-6">
                        <strong>Note:</strong> If you accept the counteroffer or re-apply, you do not need to pay for credit checks again.
                    </p>
                    <div className="space-y-3">
                        <button
                            onClick={async () => {
                                // Accept counteroffer - update loan details and proceed
                                const updatedLoanDetails = {
                                    ...formData.loanDetails,
                                    depositAmount: counterOffer.minimum_deposit,
                                    tenor: counterOffer.minimum_tenor
                                };
                                setFormData({ ...formData, loanDetails: updatedLoanDetails });
                                setStep(16); // Proceed to complete form with counteroffer
                            }}
                            className="w-full bg-[#273e8e] text-white py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors"
                        >
                            Accept Counteroffer
                        </button>
                        {/* <button
                            onClick={() => {
                                // Re-apply - go back to loan calculator
                                setStep(8);
                            }}
                            className="w-full border-2 border-gray-300 text-gray-700 py-4 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                        >
                            Re-apply with Different Terms
                        </button> */}
                    </div>
                </div>
            </div>
        );
    };

    const renderStep16 = () => (
        <div className="animate-fade-in max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-8 text-[#273e8e]">
                Guarantor Credit Check
            </h2>
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-blue-200">
                <div className="flex items-center mb-6">
                    <Clock size={32} className="text-blue-600 mr-4" />
                    <h3 className="text-2xl font-bold text-blue-700">Under Review</h3>
                </div>
                <p className="text-gray-600 mb-6">
                    Your guarantor's credit check is currently under review. You will receive feedback within 24 hours.
                </p>
                <p className="text-sm text-gray-500 mb-6">
                    <strong>Important:</strong> If your guarantor does not qualify, your loan will not be disbursed.
                </p>
                <button
                    onClick={() => {
                        // Check status - this would typically poll or check API
                        setStep(19); // Proceed to agreement step
                    }}
                    className="w-full bg-[#273e8e] text-white py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors"
                >
                    Continue
                </button>
            </div>
        </div>
    );

    const handleGuarantorInvite = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const response = await axios.post(API.BNPL_GUARANTOR_INVITE, {
                loan_application_id: applicationId,
                full_name: formData.guarantorName,
                phone: formData.guarantorPhone,
                email: formData.guarantorEmail,
                relationship: formData.guarantorRelationship
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (response.data.status === 'success') {
                setGuarantorId(response.data.data.id);
                alert("Guarantor details saved. You can now download the form.");
            }
        } catch (error) {
            console.error("Guarantor Invite Error:", error);
            alert("Failed to save guarantor details.");
        } finally {
            setLoading(false);
        }
    };

    const handleGuarantorUpload = async (file) => {
        if (!file) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const uploadData = new FormData();
            if (guarantorId) uploadData.append('guarantor_id', String(guarantorId));
            if (applicationId) uploadData.append('loan_application_id', String(applicationId));
            uploadData.append('signed_form', file);

            const response = await axios.post(API.BNPL_GUARANTOR_UPLOAD, uploadData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (response.data.status === 'success') {
                setStep(19); // Proceed to Agreement Step (NEW)
            }
        } catch (error) {
            console.error("Guarantor Upload Error:", error);
            alert("Failed to upload guarantor form.");
        } finally {
            setLoading(false);
        }
    };

    const renderStep19 = () => (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
                    <h2 className="text-2xl font-bold text-[#273e8e]">Important Agreement</h2>
                    <button
                        onClick={() => {
                            // Don't allow closing without agreement
                            if (!formData.agreedToTerms) {
                                alert("Please read and accept the agreement to proceed.");
                            }
                        }}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        disabled={!formData.agreedToTerms}
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-lg mb-6">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="text-yellow-600 flex-shrink-0 mt-1" size={24} />
                            <div>
                                <p className="text-gray-700 leading-relaxed font-semibold mb-3">
                                    Important Notice Regarding Guarantor Documents
                                </p>
                                <p className="text-gray-700 leading-relaxed mb-4">
                                    Signed guarantor forms and undated cheques are required before installation. Signed guarantor forms should be uploaded on or before the installation date and undated cheques must be made available on or before the day of installation; installation will not proceed without them.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Full Agreement Text */}
                    <div className="space-y-4 text-gray-700 leading-relaxed">
                        <div>
                            <h3 className="font-bold text-gray-800 mb-2">1. Loan Agreement Terms</h3>
                            <p className="text-sm">
                                By proceeding with this Buy Now Pay Later (BNPL) application, you agree to the terms and conditions outlined in this agreement. This loan facility is provided to enable you to purchase solar energy systems and related equipment.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-bold text-gray-800 mb-2">2. Guarantor Requirements</h3>
                            <p className="text-sm">
                                You are required to provide signed guarantor documents and undated signed cheques before the installation of your solar system can proceed. These documents must be submitted on the day of installation. Failure to provide these documents will result in the cancellation of your installation appointment.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-bold text-gray-800 mb-2">3. Repayment Obligations</h3>
                            <p className="text-sm">
                                You agree to make timely repayments as per the repayment schedule provided. Late payments may incur additional charges and affect your credit standing. Defaulting on payments may result in legal action and recovery of the loan amount.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-bold text-gray-800 mb-2">4. Installation Process</h3>
                            <p className="text-sm">
                                Installation will only proceed upon receipt of all required documents including signed guarantor forms and undated cheques. The installation date will be scheduled after all documentation is complete and verified.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-bold text-gray-800 mb-2">5. System Ownership</h3>
                            <p className="text-sm">
                                The solar system remains the property of the lender until full payment is made. Upon completion of all repayments, ownership will be transferred to you.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-bold text-gray-800 mb-2">6. Default and Consequences</h3>
                            <p className="text-sm">
                                In the event of default, the lender reserves the right to recover the outstanding amount through the provided cheques and guarantor obligations. Legal action may be taken to recover the debt.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-bold text-gray-800 mb-2">7. Data and Privacy</h3>
                            <p className="text-sm">
                                Your personal and financial information will be used for credit assessment, loan processing, and account management. We are committed to protecting your data in accordance with applicable privacy laws.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-bold text-gray-800 mb-2">8. Acknowledgment</h3>
                            <p className="text-sm">
                                By accepting this agreement, you acknowledge that you have read, understood, and agree to all terms and conditions stated herein. You confirm that all information provided is accurate and that you understand your obligations under this loan agreement.
                            </p>
                        </div>
                    </div>

                    {/* Agreement Checkbox */}
                    <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <label className="flex items-start cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.agreedToTerms || false}
                                onChange={(e) => setFormData({ ...formData, agreedToTerms: e.target.checked })}
                                className="mt-1 h-5 w-5 text-[#273e8e] focus:ring-[#273e8e] border-gray-300 rounded flex-shrink-0"
                            />
                            <span className="ml-3 text-gray-700 text-sm leading-relaxed">
                                I understand and agree to all the terms and conditions stated above. I acknowledge that installation will not proceed without receiving the signed guarantor documents and undated cheques. I confirm that I have read and understood my obligations under this loan agreement.
                            </span>
                        </label>
                    </div>
                </div>

                {/* Footer with Buttons on One Line */}
                <div className="flex items-center justify-end gap-4 p-6 border-t border-gray-200 flex-shrink-0">
                    <button
                        onClick={() => {
                            if (!formData.agreedToTerms) {
                                alert("Please read and accept the agreement to proceed.");
                                return;
                            }
                            setStep(18); // Go back
                        }}
                        className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            if (!formData.agreedToTerms) {
                                alert("Please read and accept the agreement to proceed.");
                                return;
                            }
                            setStep(20);
                        }}
                        disabled={!formData.agreedToTerms}
                        className={`px-6 py-3 rounded-xl font-bold transition-colors ${
                            formData.agreedToTerms
                                ? 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        I Agree and Continue
                    </button>
                </div>
            </div>
        </div>
    );

    const renderStep20 = () => (
        <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-green-200">
            <h2 className="text-2xl font-bold mb-6 text-[#273e8e]">Confirmation</h2>
            <div className="bg-green-50 border border-green-200 p-6 rounded-lg mb-6">
                <CheckCircle className="text-green-600 mb-3" size={32} />
                <p className="text-gray-700 mb-4">
                    Thank you for confirming your agreement. Your loan will be disbursed to your wallet to complete your purchase.
                </p>
                <p className="text-sm text-gray-600">
                    You can now proceed to view your order summary and invoice.
                </p>
            </div>
            <button
                onClick={() => setStep(21)}
                className="w-full bg-[#273e8e] text-white py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors"
            >
                Proceed to Order Summary
            </button>
        </div>
    );

    const renderStep17 = () => (
        <div className="animate-fade-in max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-2xl font-bold mb-6 text-[#273e8e]">Guarantor Information</h2>

            {!guarantorId ? (
                <form onSubmit={handleGuarantorInvite} className="space-y-4">
                    <p className="text-gray-600 mb-4">Please provide details of your guarantor.</p>
                    <input
                        type="text"
                        placeholder="Guarantor Full Name"
                        required
                        className="w-full p-3 border rounded-lg"
                        onChange={(e) => setFormData({ ...formData, guarantorName: e.target.value })}
                    />
                    <input
                        type="tel"
                        placeholder="Guarantor Phone"
                        required
                        className="w-full p-3 border rounded-lg"
                        onChange={(e) => setFormData({ ...formData, guarantorPhone: e.target.value })}
                    />
                    <input
                        type="email"
                        placeholder="Guarantor Email (Optional)"
                        className="w-full p-3 border rounded-lg"
                        onChange={(e) => setFormData({ ...formData, guarantorEmail: e.target.value })}
                    />
                    <input
                        type="text"
                        placeholder="Relationship (e.g. Spouse, Colleague)"
                        className="w-full p-3 border rounded-lg"
                        onChange={(e) => setFormData({ ...formData, guarantorRelationship: e.target.value })}
                    />
                    <button type="submit" disabled={loading} className="w-full bg-[#273e8e] text-white py-3 rounded-xl font-bold">
                        {loading ? 'Saving...' : 'Save & Continue'}
                    </button>
                </form>
            ) : (
                <div className="space-y-6">
                    <div className="bg-green-50 border border-green-200 p-4 rounded-lg flex items-center">
                        <CheckCircle className="text-green-600 mr-3" size={20} />
                        <p className="text-sm text-green-700">Guarantor details saved successfully.</p>
                    </div>

                    <div className="border-t pt-4">
                        <h3 className="font-bold text-gray-800 mb-2">Step 1: Download Form</h3>
                        <button 
                            onClick={async () => {
                                try {
                                    const token = localStorage.getItem('access_token');
                                    if (!token) {
                                        alert("Please login to continue");
                                        navigate('/login');
                                        return;
                                    }
                                    
                                    // Fetch guarantor form PDF from API
                                    const response = await axios.get(`${API.BNPL_GUARANTOR_FORM}?loan_application_id=${applicationId}`, {
                                        headers: { Authorization: `Bearer ${token}` },
                                        responseType: 'blob'
                                    });
                                    const blob = response.data;
                                    const contentType = response.headers?.['content-type'] || '';
                                    if (!blob || blob.size === 0) {
                                        alert('Received empty file. Please try again or contact support.');
                                        return;
                                    }
                                    if (contentType.includes('application/json')) {
                                        const text = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(blob); });
                                        const err = typeof text === 'string' && text.length ? JSON.parse(text) : {};
                                        alert(err.message || 'Failed to download guarantor form. Please try again.');
                                        return;
                                    }
                                    // Create download link
                                    const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.setAttribute('download', `guarantor-form-${applicationId}.pdf`);
                                    document.body.appendChild(link);
                                    link.click();
                                    link.remove();
                                    window.URL.revokeObjectURL(url);
                                } catch (error) {
                                    console.error("Download error:", error);
                                    const fallbackUrl = import.meta.env.VITE_GUARANTOR_FORM_FALLBACK_URL;
                                    if (fallbackUrl) {
                                        window.open(fallbackUrl, '_blank');
                                        return;
                                    }
                                    if (error.response?.status === 404) {
                                        alert("Guarantor form is not available yet. Please contact support or try again later.");
                                    } else {
                                        alert("Failed to download guarantor form. Please contact support or try again later.");
                                    }
                                }
                            }}
                            className="w-full border-2 border-[#273e8e] text-[#273e8e] py-3 rounded-xl font-bold hover:bg-blue-50 transition-colors flex items-center justify-center mb-4"
                        >
                            <Download size={20} className="mr-2" /> Download Guarantor Form
                        </button>
                        <p className="text-xs text-gray-500 text-center">
                            Download the form, have your guarantor sign it, then upload it below.
                        </p>
                    </div>

                    <div className="border-t pt-4">
                        <h3 className="font-bold text-gray-800 mb-2">Step 2: Upload Signed Form</h3>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#273e8e] transition-colors cursor-pointer relative">
                            <input
                                type="file"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={(e) => handleGuarantorUpload(e.target.files[0])}
                                accept=".pdf,.jpg,.png"
                            />
                            {loading ? (
                                <Loader className="animate-spin mx-auto text-[#273e8e]" />
                            ) : (
                                <>
                                    <Upload className="mx-auto text-gray-400 mb-2" />
                                    <p className="text-sm text-gray-500">Click to upload signed form</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // Fetch invoice data when step 21 loads
    React.useEffect(() => {
        if (step === 21 && applicationId) {
            const fetchInvoice = async () => {
                try {
                    const token = localStorage.getItem('access_token');
                    if (!token) return;
                    
                    // Try to fetch invoice from API first
                    try {
                        const response = await axios.get(API.BNPL_INVOICE(applicationId), {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        
                        if (response.data.status === 'success' && response.data.data) {
                            setInvoiceData(response.data.data);
                            return; // Successfully fetched from API
                        }
                    } catch (apiError) {
                        // If API is not available (404), fall back to calculated values
                        console.log("Invoice API not available, using calculated values:", apiError.message);
                    }
                    
                    // Fallback: derive from selected bundle fees / pricing snapshot (no hardcoded defaults)
                    const pricing = getBnplPricingSnapshot();
                    const feeTotals = (formData.selectedBundles || []).reduce(
                        (acc, sb) => {
                            const bundleObj = sb.bundle || {};
                            const fees = bundleObj.fees || {};
                            acc.installation += Number(fees.installation_fee || 0);
                            acc.delivery += Number(fees.delivery_fee || 0);
                            acc.inspection += Number(fees.inspection_fee || 0);
                            return acc;
                        },
                        { installation: 0, delivery: 0, inspection: 0 }
                    );
                    if (feeTotals.delivery <= 0 && (formData.selectedBundles || []).length === 0) {
                        feeTotals.delivery = getBnplDeliveryFeeFallback();
                    }
                    const insurancePct = Number(loanConfig?.insurance_fee_percentage ?? DEFAULT_INSURANCE_PERCENT);
                    const catalogSubtotal = pricing.catalogSubtotal || pricing.basePrice || formData.selectedProductPrice;
                    const insuranceFee = (catalogSubtotal * insurancePct) / 100;
                    const productPrice = catalogSubtotal;

                    setInvoiceData({
                        product_price: productPrice,
                        material_cost: 0,
                        installation_fee: feeTotals.installation,
                        delivery_fee: feeTotals.delivery,
                        inspection_fee: feeTotals.inspection,
                        insurance_fee: insuranceFee,
                        total: productPrice + feeTotals.installation + feeTotals.delivery + feeTotals.inspection + insuranceFee,
                        loan_details: formData.loanDetails ? {
                            deposit_amount: formData.loanDetails.depositAmount,
                            monthly_repayment: formData.loanDetails.monthlyRepayment,
                            total_repayment: formData.loanDetails.totalRepayment
                        } : null
                    });
                } catch (error) {
                    console.error("Failed to fetch invoice:", error);
                }
            };
            fetchInvoice();
        }
    }, [step, applicationId, formData.selectedProductPrice, formData.loanDetails, loanConfig]);

    const renderStep21 = () => {
        const pricingFallback = getBnplPricingSnapshot();
        const catalogSubtotal = pricingFallback.catalogSubtotal || pricingFallback.basePrice || formData.selectedProductPrice;
        const insurancePct = Number(loanConfig?.insurance_fee_percentage ?? DEFAULT_INSURANCE_PERCENT);
        const invoice = invoiceData || {
            product_price: catalogSubtotal,
            material_cost: 0,
            installation_fee: 0,
            delivery_fee: formData.selectedBundles.length > 0 ? 0 : getBnplDeliveryFeeFallback(),
            inspection_fee: 0,
            insurance_fee: (catalogSubtotal * insurancePct) / 100,
            total: pricingFallback.overallGrandTotal || catalogSubtotal,
        };

        // Use product_price from API if available, otherwise use formData
        const basePrice = invoice?.product_price || formData.selectedProductPrice || 0;

        return (
        <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-2xl font-bold mb-6 text-[#273e8e] border-b pb-4">Order Summary & Invoice</h2>

            <div className="space-y-4 mb-8">
                {/* Detailed Invoice Breakdown as per requirements */}
                <div className="border-b pb-4 mb-4">
                    <h3 className="font-bold text-gray-800 mb-3">Invoice Details</h3>
                </div>
                
                {/* Product Breakdown from API (if available) */}
                {invoice?.product_breakdown ? (
                    <>
                        {invoice.product_breakdown.solar_inverter && (
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-medium text-gray-800">Solar Inverter</p>
                                    {invoice.product_breakdown.solar_inverter.quantity > 0 && (
                                        <p className="text-sm text-gray-500">Quantity: {invoice.product_breakdown.solar_inverter.quantity}</p>
                                    )}
                                </div>
                                <span className="font-bold">₦{Number(invoice.product_breakdown.solar_inverter.price || 0).toLocaleString()}</span>
                            </div>
                        )}
                        {invoice.product_breakdown.solar_panels && (
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-medium text-gray-800">Solar Panels</p>
                                    {invoice.product_breakdown.solar_panels.quantity > 0 && (
                                        <p className="text-sm text-gray-500">Quantity: {invoice.product_breakdown.solar_panels.quantity}</p>
                                    )}
                                </div>
                                <span className="font-bold">₦{Number(invoice.product_breakdown.solar_panels.price || 0).toLocaleString()}</span>
                            </div>
                        )}
                        {invoice.product_breakdown.batteries && (
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-medium text-gray-800">Batteries</p>
                                    {invoice.product_breakdown.batteries.quantity > 0 && (
                                        <p className="text-sm text-gray-500">Quantity: {invoice.product_breakdown.batteries.quantity}</p>
                                    )}
                                </div>
                                <span className="font-bold">₦{Number(invoice.product_breakdown.batteries.price || 0).toLocaleString()}</span>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {/* Fallback: Use percentages if product_breakdown not available */}
                        {/* Solar Inverter */}
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="font-medium text-gray-800">Solar Inverter</p>
                                <p className="text-sm text-gray-500">Quantity: 1</p>
                            </div>
                            <span className="font-bold">₦{Number(basePrice * 0.4).toLocaleString()}</span>
                        </div>
                        
                        {/* Solar Panels */}
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="font-medium text-gray-800">Solar Panels</p>
                                <p className="text-sm text-gray-500">Quantity: 1</p>
                            </div>
                            <span className="font-bold">₦{Number(basePrice * 0.35).toLocaleString()}</span>
                        </div>
                        
                        {/* Batteries */}
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="font-medium text-gray-800">Batteries</p>
                                <p className="text-sm text-gray-500">Quantity: 1</p>
                            </div>
                            <span className="font-bold">₦{Number(basePrice * 0.25).toLocaleString()}</span>
                        </div>
                    </>
                )}

                {/* Items Subtotal */}
                <div className="border-t pt-3 mt-3">
                    <div className="flex justify-between items-center">
                        <span className="font-semibold text-gray-700">Items Subtotal:</span>
                        <span className="font-bold">₦{Number(basePrice || 0).toLocaleString()}</span>
                    </div>
                </div>
                
                {/* Material Cost */}
                <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>Material Cost (Cables, Breakers, Surge Protectors, Trunking, and Pipes)</span>
                    <span>₦{Number(invoice?.material_cost || 0).toLocaleString()}</span>
                </div>
                
                {/* Installation Fee */}
                <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>Installation Fees</span>
                    <span>₦{Number(invoice?.installation_fee || 0).toLocaleString()}</span>
                </div>
                
                {/* Delivery/Logistics */}
                <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>Delivery/Logistics Fees</span>
                    <span>₦{Number(invoice?.delivery_fee || 0).toLocaleString()}</span>
                </div>
                
                {/* Inspection Fee */}
                <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>Inspection Fees</span>
                    <span>₦{Number(invoice?.inspection_fee || 0).toLocaleString()}</span>
                </div>
                
                {/* Insurance Fee */}
                <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>Insurance Fee</span>
                    <span>₦{Number(invoice?.insurance_fee || 0).toLocaleString()}</span>
                </div>

                {/* Add-ons Total */}
                {invoice?.add_ons_total && invoice.add_ons_total > 0 && (
                    <div className="flex justify-between items-center text-sm text-gray-600">
                        <span>Additional Services</span>
                        <span>₦{Number(invoice.add_ons_total || 0).toLocaleString()}</span>
                    </div>
                )}

                <div className="border-t pt-4 mt-4">
                    <div className="flex justify-between items-center text-xl font-bold">
                        <span>Total</span>
                        <span className="text-[#273e8e]">₦{Number(invoice?.total || 0).toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mb-6 flex items-start">
                <AlertCircle className="text-yellow-600 mr-3 mt-1" size={20} />
                <p className="text-sm text-yellow-700">
                    Installation fees may change after site inspection. Any difference will be updated and shared with you for a one-off payment before installation.
                </p>
            </div>

            {(invoice.loan_details || formData.loanDetails) && (
                <div className="bg-blue-50 p-4 rounded-lg mb-8">
                    <h4 className="font-bold text-[#273e8e] mb-2">Payment Schedule</h4>
                    <div className="flex justify-between text-sm mb-1">
                        <span>Initial Deposit + Admin Fees</span>
                        <span className="font-bold">₦{Number(invoice.loan_details?.deposit_amount || formData.loanDetails?.depositAmount || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-1">
                        <span>Monthly Repayment</span>
                        <span className="font-bold">₦{Number(invoice.loan_details?.monthly_repayment || formData.loanDetails?.monthlyRepayment || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span>Total Repayment</span>
                        <span className="font-bold">₦{Number(invoice.loan_details?.total_repayment || formData.loanDetails?.totalRepayment || 0).toLocaleString()}</span>
                    </div>
                </div>
            )}

            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6 flex items-start">
                <Calendar className="text-blue-600 mr-3 mt-1" size={20} />
                <p className="text-sm text-blue-700">
                    Within 24 – 72 hours, our team will contact you to schedule your installation date.
                </p>
            </div>

            <button 
                onClick={async () => {
                    // Handle upfront deposit payment for approved applications
                    if (applicationId && formData.loanDetails) {
                        await handleUpfrontDepositPayment();
                    } else {
                        // For new applications, proceed to loan calculator
                        setStep(8);
                    }
                }}
                disabled={processingPayment || (applicationId && !formData.loanDetails)}
                className={`w-full py-4 rounded-xl font-bold transition-colors flex items-center justify-center ${
                    processingPayment || (applicationId && !formData.loanDetails)
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
                    applicationId && formData.loanDetails 
                        ? `Pay Upfront Deposit (₦${Number(formData.loanDetails.depositAmount || 0).toLocaleString()})`
                        : 'Proceed to Loan Calculator'
                )}
            </button>
        </div>
        );
    };

    const renderBnplProgressStrip = () => (
        <div className="mb-12 max-w-xl mx-auto">
            <div className="flex justify-between text-sm font-medium text-gray-400 mb-2">
                <span className={step >= 1 ? "text-[#273e8e]" : ""}>Type</span>
                <span className={step >= 2 ? "text-[#273e8e]" : ""}>Product</span>
                <span className={step >= 11 ? "text-[#273e8e]" : ""}>Apply</span>
                <span className={step >= 12 ? "text-[#273e8e]" : ""}>Approval</span>
                <span className={step >= 21 ? "text-[#273e8e]" : ""}>Finish</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className="h-full bg-[#273e8e] transition-all duration-500 ease-out"
                    style={{ width: `${(step / 21) * 100}%` }}
                />
            </div>
        </div>
    );

    if (!bnplTermsAccepted) return renderTermsGate();

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col" >
            {/* Navbar Placeholder */}
            < div className="bg-white shadow-sm p-4 sticky top-0 z-50" >
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="font-bold text-xl text-[#273e8e]">Troosolar</div>
                    <button onClick={() => navigate('/')} className="text-gray-600 hover:text-[#273e8e]">
                        Exit Application
                    </button>
                </div>
            </div >

            {step === 9 && (
                <div className="w-full max-w-6xl mx-auto px-6 pt-6">
                    {renderStep9()}
                </div>
            )}

            {step === 2 ? (
                <div className="animate-fade-in flex-1 w-full px-6 py-6 overflow-y-auto">
                    <div className="w-full max-w-6xl mx-auto">
                        {renderBnplProgressStrip()}
                        {renderStep2()}
                    </div>
                </div>
            ) : (
            /* Main Content */
            < div className="flex-grow flex items-center justify-center p-6" >
                <div className="w-full max-w-6xl">
                    {step !== 9 && (
                        <>
                            {renderBnplProgressStrip()}

                            {step === 1 && renderStep1()}
                            {step === 2.5 && renderStep2_5()}
                            {step === 3 && renderStep3()}
                            {step === 3.5 && renderStep3_5()}
                            {step === 3.6 && renderStep3_6()}
                            {step === 3.75 && renderStep3_75()}
                            {step === 4 && renderStep4()}
                            {step === 5 && renderStep5()}
                            {step === 6 && renderStep6()}
                            {step === 6.5 && renderStep6_5()}
                            {step === 6.75 && renderStep6_75()}
                            {step === 7 && renderStep7()}
                            {step === 7.5 && renderStep7_5()}
                            {step === 8 && renderStep8()}
                            {step === 10 && renderStep10()}
                            {step === 11 && renderStep11()}
                            {step === 12 && renderStep12()}
                            {step === 13 && renderStep13()}
                            {step === 14 && renderStep14()}
                            {step === 15 && renderStep15()}
                            {step === 16 && renderStep16()}
                            {step === 17 && renderStep17()}
                            {step === 19 && renderStep19()}
                            {step === 20 && renderStep20()}
                            {step === 21 && renderStep21()}
                        </>
                    )}
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
                                    setStep(6.5);
                                }}
                                className="w-full py-3 rounded-xl bg-[#273e8e] text-white font-semibold hover:bg-[#1a2b6b] transition-colors"
                            >
                                Proceed with Selected Bundle
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div >
    );
};

export default BNPLFlow;
