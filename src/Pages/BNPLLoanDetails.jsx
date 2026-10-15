import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SideBar from '../Component/SideBar';
import TopNavbar from '../Component/TopNavbar';
import axios from 'axios';
import API, { FLUTTERWAVE_PUBLIC_KEY } from '../config/api.config';
import { loginPathWithReturn } from '../utils/authRedirect';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle, 
  FileText, 
  ChevronLeft,
  Calendar,
  CreditCard,
  Home,
  User,
  MapPin,
  Phone,
  Mail,
  Building,
  Package,
  TrendingUp,
  Receipt,
  ArrowRight,
  CheckCircle2,
  X,
  Download,
  Upload,
  Loader
} from 'lucide-react';
import Loading from '../Component/Loading';
import BNPLPaymentModal from '../Component/BNPLPaymentModal';
import RepaymentCalendar from '../Component/RepaymentCalendar';

/** Default BNPL interest rate (%). Used for Total Interest when backend does not provide one. Change as needed. */
const DEFAULT_BNPL_INTEREST_RATE_PERCENT = 4;

/* Flutterwave script for down payment */
const ensureFlutterwave = () =>
  new Promise((resolve, reject) => {
    if (window.FlutterwaveCheckout) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.flutterwave.com/v3.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load payment gateway'));
    document.body.appendChild(s);
  });

const BNPLLoanDetails = () => {
    const navigate = useNavigate();
    const { id } = useParams(); // Get order ID from URL
    const [orderData, setOrderData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pagination, setPagination] = useState({
        current_page: 1,
        last_page: 1,
        per_page: 15,
        total: 0
    });
    const [selectedInstallment, setSelectedInstallment] = useState(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [installmentsWithHistory, setInstallmentsWithHistory] = useState(null);
    const [processingDownPayment, setProcessingDownPayment] = useState(false);
    const [processingCounterOffer, setProcessingCounterOffer] = useState(false);
    const [downloadingGuarantorForm, setDownloadingGuarantorForm] = useState(false);
    const [uploadingGuarantorForm, setUploadingGuarantorForm] = useState(false);
    const [guarantorIdFromInvite, setGuarantorIdFromInvite] = useState(null);
    const [showBookInstallationModal, setShowBookInstallationModal] = useState(false);
    const [bookingInstallationDate, setBookingInstallationDate] = useState('');
    const [processingBookInstallation, setProcessingBookInstallation] = useState(false);
    const [processingMandateSetup, setProcessingMandateSetup] = useState(false);

    const handleSetupMonoMandate = async (monoCalculationId, loanApplicationId) => {
        if (!monoCalculationId) {
            alert('Loan calculation not found. Please try again after your order is created.');
            return;
        }
        setProcessingMandateSetup(true);
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                alert('Please login to continue');
                return;
            }
            const response = await axios.post(
                API.BNPL_MANDATE_INITIATE,
                {
                    mono_calculation_id: monoCalculationId,
                    loan_application_id: loanApplicationId || undefined,
                },
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                }
            );
            const authUrl = response.data?.data?.authorization_url;
            if (authUrl) {
                window.open(authUrl, '_blank', 'noopener,noreferrer');
            }
            alert(
                'Open the Mono window to authorize automatic repayments from your bank (e-mandate). ' +
                'After you complete the ₦50 verification transfer, your bank may take up to 72 hours to approve the mandate.'
            );
            if (id && !id.startsWith('app-')) {
                fetchOrderDetails(id);
            } else if (loanApplicationId) {
                fetchApplicationDetails(String(loanApplicationId));
            }
        } catch (err) {
            alert(err.response?.data?.message || err.message || 'Failed to start Mono Direct Debit setup.');
        } finally {
            setProcessingMandateSetup(false);
        }
    };

    useEffect(() => {
        if (id) {
            setGuarantorIdFromInvite(null);
            if (id.startsWith('app-')) {
                const applicationId = id.replace('app-', '');
                fetchApplicationDetails(applicationId);
            } else {
                fetchOrderDetails(id);
            }
        } else {
            fetchAllOrders();
        }
    }, [id]);

    const fetchOrderDetails = async (orderId) => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                setError('Please login to view loan details');
                setLoading(false);
                return;
            }

            const response = await axios.get(API.BNPL_ORDER_DETAILS(orderId), {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json'
                }
            });

            if (response.data.status === 'success' && response.data.data) {
                const orderDetails = response.data.data;
                
                // If repayment schedule is missing, try to fetch it
                if (!orderDetails.repayment_schedule || orderDetails.repayment_schedule.length === 0) {
                    const loanAppId = orderDetails.loan_application?.id || orderDetails.application?.id;
                    if (loanAppId) {
                        try {
                            const scheduleResponse = await axios.get(API.BNPL_REPAYMENT_SCHEDULE(loanAppId), {
                                headers: { 
                                    Authorization: `Bearer ${token}`,
                                    Accept: 'application/json'
                                }
                            });
                            
                            if (scheduleResponse.data.status === 'success' && scheduleResponse.data.data) {
                                const d = scheduleResponse.data.data;
                                orderDetails.repayment_schedule = Array.isArray(d.installments)
                                    ? d.installments
                                    : Array.isArray(d.schedule)
                                      ? d.schedule
                                      : Array.isArray(d)
                                        ? d
                                        : [];
                            }
                        } catch (scheduleErr) {
                            console.log('Could not fetch repayment schedule:', scheduleErr);
                        }
                    }
                }
                
                // Also fetch installments with history for additional data
                try {
                    const historyResponse = await axios.get(API.Loan_Payment_Relate, {
                        headers: { 
                            Authorization: `Bearer ${token}`,
                            Accept: 'application/json'
                        }
                    });
                    
                    if (historyResponse.data.status === 'success' && historyResponse.data.data) {
                        setInstallmentsWithHistory(historyResponse.data.data);
                    }
                } catch (historyErr) {
                    console.log('Could not fetch installments with history:', historyErr);
                }
                
                const la = orderDetails.loan_application || orderDetails.application;
                const snap = la?.loan_plan_snapshot;
                const mappedFromSnap =
                    snap && typeof snap === 'object'
                        ? {
                              totalAmount: snap.totalAmount,
                              depositAmount: snap.depositAmount,
                              baseDepositAmount: snap.baseDepositAmount,
                              totalLoanAmount: snap.totalLoanAmount ?? snap.principal,
                              principal: snap.principal,
                              totalInterestAmount: snap.totalInterestAmount ?? snap.totalInterest,
                              totalRepaymentAmount: snap.totalRepaymentAmount ?? snap.totalRepayment,
                              monthlyRepaymentAmount: snap.monthlyRepaymentAmount ?? snap.monthlyRepayment,
                              depositPercent: snap.depositPercent ?? snap.deposit_percent,
                              insuranceFee: snap.insuranceFee,
                              managementFee: snap.managementFee,
                              legalFee: snap.legalFee,
                              adminFeesTotal: snap.adminFeesTotal,
                              tenor: snap.tenor,
                              interestRate: snap.interestRate ?? snap.interest_rate,
                          }
                        : null;

                const mapApiLoanDetails = (apiLd) => {
                    if (!apiLd || typeof apiLd !== 'object') return null;
                    const hasCamel =
                        apiLd.totalAmount != null ||
                        apiLd.depositAmount != null ||
                        apiLd.totalLoanAmount != null ||
                        apiLd.principal != null;
                    if (hasCamel) return apiLd;
                    return {
                        totalAmount: apiLd.total_amount,
                        depositAmount: apiLd.down_payment,
                        totalLoanAmount: apiLd.loan_amount,
                        principal: apiLd.principal ?? apiLd.loan_amount,
                        tenor: apiLd.tenor ?? apiLd.repayment_duration,
                        interestRate: apiLd.interestRate ?? apiLd.interest_rate,
                        repayment_duration: apiLd.repayment_duration,
                        depositPercent: apiLd.depositPercent ?? apiLd.deposit_percent,
                        baseDepositAmount: apiLd.baseDepositAmount ?? apiLd.base_deposit_amount,
                    };
                };
                const mappedFromApiLd = mapApiLoanDetails(orderDetails.loan_details);

                const partnerOfferFromLa = la
                    ? {
                          interest_rate: la.partner_offer_interest_rate ?? orderDetails.partner_offer?.interest_rate ?? null,
                          deposit_percent: la.partner_offer_deposit_percent ?? orderDetails.partner_offer?.deposit_percent ?? null,
                          initial_deposit: la.partner_offer_initial_deposit ?? orderDetails.partner_offer?.initial_deposit ?? null,
                          admin_fees: la.partner_offer_admin_fees ?? orderDetails.partner_offer?.admin_fees ?? null,
                          repayment_amount: la.partner_offer_repayment_amount ?? orderDetails.partner_offer?.repayment_amount ?? null,
                          loan_amount: la.partner_offer_loan_amount ?? orderDetails.partner_offer?.loan_amount ?? null,
                          tenor: la.partner_offer_tenor ?? orderDetails.partner_offer?.tenor ?? null,
                          writeup: la.partner_offer_writeup ?? orderDetails.partner_offer?.writeup ?? null,
                          documents: la.partner_offer_documents ?? orderDetails.partner_offer?.documents ?? [],
                      }
                    : (orderDetails.partner_offer || null);

                // Normalize the order data structure
                const normalizedOrder = {
                    ...orderDetails,
                    // Ensure status is available (use order_status if status is not present)
                    status: orderDetails.status || orderDetails.order_status,
                    order_status: orderDetails.order_status || orderDetails.status,
                    // Ensure loan_application is accessible
                    loan_application: la,
                    application: orderDetails.application || orderDetails.loan_application,
                    loan_plan_snapshot: snap || orderDetails.loan_plan_snapshot,
                    loan_calculation: orderDetails.loan_calculation ?? null,
                    loan_details: mappedFromSnap || mappedFromApiLd || orderDetails.loan_details,
                    financing_path: orderDetails.financing_path || la?.financing_path || null,
                    admin_notes: orderDetails.admin_notes || la?.admin_notes || null,
                    partner_offer: partnerOfferFromLa,
                    // Keep counter offer visible after down payment (status often becomes approved).
                    had_counter_offer: !!(orderDetails.had_counter_offer || la?.had_counter_offer),
                    counter_offer_min_deposit:
                        orderDetails.counter_offer_min_deposit ?? la?.counter_offer_min_deposit ?? null,
                    counter_offer_min_tenor:
                        orderDetails.counter_offer_min_tenor ?? la?.counter_offer_min_tenor ?? null,
                    counter_offer_details:
                        orderDetails.counter_offer_details || la?.counter_offer_details || null,
                    isApplication: false // This is an order, not an application
                };
                
                setOrderData(normalizedOrder);
            } else {
                setError(response.data.message || 'Failed to fetch order details');
            }
        } catch (err) {
            console.error('Error fetching order details:', err);
            // If order not found, try to fetch as application
            if (err.response?.status === 404) {
                console.log('Order not found, trying to fetch as application...');
                // Could try fetching application details here if needed
            }
            setError(err.response?.data?.message || 'Failed to load order details');
        } finally {
            setLoading(false);
        }
    };

    const fetchApplicationDetails = async (applicationId) => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                setError('Please login to view loan details');
                setLoading(false);
                return;
            }

            const response = await axios.get(API.BNPL_STATUS(applicationId), {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json'
                }
            });

            if (response.data.status === 'success' && response.data.data) {
                // Transform application data to match order data structure
                const appData = response.data.data;
                
                // If down payment is done, an order exists – redirect to order view so user sees correct repayment summary
                if (appData.order_id && appData.down_payment_completed) {
                    navigate(`/bnpl-loans/${appData.order_id}`, { replace: true });
                    setLoading(false);
                    return;
                }

                // Pre-order applications must not show installment/overdue data from other loans.
                const hasActiveOrder = !!(appData.order_id || appData.down_payment_completed);
                setInstallmentsWithHistory(null);
                let repaymentSchedule = [];

                if (hasActiveOrder) {
                    try {
                        const scheduleResponse = await axios.get(API.BNPL_REPAYMENT_SCHEDULE(applicationId), {
                            headers: {
                                Authorization: `Bearer ${token}`,
                                Accept: 'application/json',
                            },
                        });

                        if (scheduleResponse.data.status === 'success' && scheduleResponse.data.data) {
                            repaymentSchedule =
                                scheduleResponse.data.data.installments ||
                                scheduleResponse.data.data.schedule ||
                                scheduleResponse.data.data ||
                                [];
                        }
                    } catch (scheduleErr) {
                        console.log('Could not fetch repayment schedule:', scheduleErr);
                    }

                    try {
                        const historyResponse = await axios.get(API.Loan_Payment_Relate, {
                            headers: {
                                Authorization: `Bearer ${token}`,
                                Accept: 'application/json',
                            },
                        });

                        if (historyResponse.data.status === 'success' && historyResponse.data.data) {
                            setInstallmentsWithHistory(historyResponse.data.data);
                            if (repaymentSchedule.length === 0) {
                                const currentMonth = historyResponse.data.data.current_month || [];
                                const history = historyResponse.data.data.history || [];
                                repaymentSchedule = [...currentMonth, ...history].sort((a, b) => {
                                    const dateA = new Date(a.payment_date || a.due_date);
                                    const dateB = new Date(b.payment_date || b.due_date);
                                    return dateA - dateB;
                                });
                            }
                        }
                    } catch (historyErr) {
                        console.log('Could not fetch installments with history:', historyErr);
                    }
                }
                
                const snap = appData.loan_plan_snapshot;
                const mappedLoanDetails =
                    snap && typeof snap === 'object'
                        ? {
                              totalAmount: snap.totalAmount,
                              depositAmount: snap.depositAmount,
                              baseDepositAmount: snap.baseDepositAmount,
                              totalLoanAmount: snap.totalLoanAmount ?? snap.principal,
                              principal: snap.principal,
                              totalInterestAmount: snap.totalInterestAmount ?? snap.totalInterest,
                              totalRepaymentAmount: snap.totalRepaymentAmount ?? snap.totalRepayment,
                              monthlyRepaymentAmount: snap.monthlyRepaymentAmount ?? snap.monthlyRepayment,
                              depositPercent: snap.depositPercent ?? snap.deposit_percent,
                              insuranceFee: snap.insuranceFee,
                              managementFee: snap.managementFee,
                              legalFee: snap.legalFee,
                              adminFeesTotal: snap.adminFeesTotal,
                              tenor: snap.tenor,
                              interestRate: snap.interestRate ?? snap.interest_rate,
                          }
                        : null;

                setOrderData({
                    ...appData,
                    id: appData.id,
                    status: appData.status,
                    created_at: appData.created_at,
                    financing_path: appData.financing_path,
                    loan_application: appData,
                    application: appData,
                    repayment_schedule: repaymentSchedule,
                    isApplication: true,
                    loan_calculation: appData.loan_calculation,
                    loan_plan_snapshot: appData.loan_plan_snapshot,
                    loan_details: mappedLoanDetails,
                    order_id: appData.order_id,
                    order_number: appData.order_number,
                    down_payment_completed: appData.down_payment_completed,
                    // Counter offer details - can be at root level or nested
                    had_counter_offer: !!appData.had_counter_offer,
                    counter_offer_min_deposit: appData.counter_offer_min_deposit,
                    counter_offer_min_tenor: appData.counter_offer_min_tenor,
                    counter_offer_details: appData.counter_offer_details,
                    partner_offer: appData.partner_offer,
                    admin_notes: appData.admin_notes
                });
            } else {
                setError(response.data.message || 'Failed to fetch application details');
            }
        } catch (err) {
            console.error('Error fetching application details:', err);
            if (err.response?.status === 401) {
                try {
                    localStorage.removeItem('access_token');
                } catch {
                    /* ignore */
                }
                navigate(loginPathWithReturn(`/bnpl-loans/app-${applicationId}`), { replace: true });
                return;
            }
            setError(err.response?.data?.message || 'Failed to load application details');
        } finally {
            setLoading(false);
        }
    };

    const fetchAllOrders = async (page = 1) => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                setError('Please login to view loan details');
                setLoading(false);
                return;
            }

            // Try to fetch orders first
            let orders = [];
            let ordersPagination = null;
            try {
                const ordersResponse = await axios.get(API.BNPL_ORDERS, {
                    headers: { 
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/json'
                    },
                    params: {
                        per_page: pagination.per_page,
                        page: page
                    }
                });

                console.log('BNPL Orders API Response:', ordersResponse.data);
                
                if (ordersResponse.data.status === 'success') {
                    // Handle different response structures
                    if (ordersResponse.data.data) {
                        if (Array.isArray(ordersResponse.data.data)) {
                            orders = ordersResponse.data.data;
                        } else if (ordersResponse.data.data.data) {
                            orders = ordersResponse.data.data.data;
                            ordersPagination = ordersResponse.data.data.pagination;
                        } else {
                            orders = [];
                        }
                    }
                }
            } catch (ordersErr) {
                console.log('No orders found or error fetching orders:', ordersErr);
                // Continue to fetch applications
            }

            // Always fetch applications to show all BNPL loans/applications
            let applications = [];
            let applicationsPagination = null;
            try {
                const appsResponse = await axios.get(API.BNPL_APPLICATIONS, {
                    headers: { 
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/json'
                    },
                    params: {
                        per_page: pagination.per_page,
                        page: page
                    }
                });

                console.log('BNPL Applications API Response:', appsResponse.data);

                if (appsResponse.data.status === 'success') {
                    // Handle different response structures
                    if (appsResponse.data.data) {
                        if (Array.isArray(appsResponse.data.data)) {
                            applications = appsResponse.data.data;
                        } else if (appsResponse.data.data.data) {
                            applications = appsResponse.data.data.data;
                            applicationsPagination = appsResponse.data.data.pagination;
                        } else {
                            applications = [];
                        }
                    }
                }
            } catch (appsErr) {
                console.log('Error fetching applications:', appsErr);
            }

            // Show all applications as the main list (so every BNPL application is visible).
            // If there are no applications, fall back to showing orders only.
            const allItems = applications.length > 0 ? applications : orders;
            const finalPagination = (applications.length > 0 ? applicationsPagination : ordersPagination) || {
                current_page: 1,
                last_page: 1,
                per_page: 15,
                total: applications.length || orders.length || 0
            };

            console.log('Combined items:', { orders: orders.length, applications: applications.length, allItems: allItems.length });

            setOrderData({ 
                orders: allItems, 
                isList: true,
                isApplications: applications.length > 0 // Treat as applications so labels and navigation use application ID
            });
            setPagination(finalPagination);
        } catch (err) {
            console.error('Error fetching orders/applications:', err);
            setError(err.response?.data?.message || 'Failed to load loan information');
        } finally {
            setLoading(false);
        }
    };

    const isLoanFullyPaid = (order) => {
        if (!order) return false;
        if (order.loan_fully_paid === true) return true;
        const status = String(order.order_status || order.status || '').toLowerCase();
        if (status === 'payment_complete' || status === 'completed') return true;
        const rs = order.repayment_summary || order.loan_summary;
        if (rs) {
            const total = Number(rs.total_installments ?? 0);
            const pending = Number(rs.pending_installments ?? 0);
            const paid = Number(rs.paid_installments ?? 0);
            if (rs.loan_fully_paid === true) return true;
            if (total > 0 && pending === 0 && paid >= total) return true;
        }
        const schedule = order.repayment_schedule || [];
        if (schedule.length > 0) {
            return schedule.every((i) =>
                String(i.status || i.computed_status || '').toLowerCase() === 'paid'
            );
        }
        return false;
    };

    const getStatusIcon = (status) => {
        switch (status?.toLowerCase()) {
            case 'approved':
            case 'active':
            case 'completed':
            case 'paid':
            case 'payment_complete':
            case 'counter_offer_accepted':
                return <CheckCircle size={24} className="text-green-600" />;
            case 'rejected':
            case 'cancelled':
                return <XCircle size={24} className="text-red-600" />;
            case 'pending':
            case 'processing':
                return <Clock size={24} className="text-blue-600" />;
            case 'counter_offer':
                return <AlertCircle size={24} className="text-yellow-600" />;
            case 'partner_offer':
                return <AlertCircle size={24} className="text-indigo-600" />;
            default:
                return <AlertCircle size={24} className="text-yellow-600" />;
        }
    };

    const getStatusBadge = (status) => {
        const statusLower = status?.toLowerCase() || 'pending';
        const badges = {
            approved: 'bg-green-100 text-green-800 border-green-300',
            active: 'bg-green-100 text-green-800 border-green-300',
            completed: 'bg-green-100 text-green-800 border-green-300',
            paid: 'bg-green-100 text-green-800 border-green-300',
            payment_complete: 'bg-emerald-100 text-emerald-800 border-emerald-300',
            rejected: 'bg-red-100 text-red-800 border-red-300',
            cancelled: 'bg-red-100 text-red-800 border-red-300',
            pending: 'bg-blue-100 text-blue-800 border-blue-300',
            processing: 'bg-yellow-100 text-yellow-800 border-yellow-300',
            overdue: 'bg-red-100 text-red-800 border-red-300',
            counter_offer: 'bg-yellow-100 text-yellow-800 border-yellow-300',
            partner_offer: 'bg-indigo-100 text-indigo-800 border-indigo-300',
            counter_offer_accepted: 'bg-green-100 text-green-800 border-green-300'
        };
        return badges[statusLower] || badges.pending;
    };

    const confirmDownPayment = async (applicationId, txId, amount) => {
        const token = localStorage.getItem('access_token');
        if (!token) return null;
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
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                }
            );
            if (data?.status !== 'success') return null;
            return data?.data || data;
        } catch (e) {
            console.error('Down payment confirmation failed:', e);
            return null;
        }
    };

    const handlePayDownPayment = async (overrideAmount = null) => {
        if (!id || !id.startsWith('app-')) return;
        const applicationId = id.replace('app-', '');
        const order = orderData;
        const partnerOffer = order?.partner_offer;
        const isPartnerOffer =
            String(getDisplayStatus(order) || '').toLowerCase() === 'partner_offer' ||
            !!(partnerOffer && (
                partnerOffer.loan_amount != null ||
                partnerOffer.initial_deposit != null ||
                partnerOffer.repayment_amount != null
            ));

        let downPaymentAmount = 0;
        if (overrideAmount != null && Number.isFinite(Number(overrideAmount)) && Number(overrideAmount) > 0) {
            downPaymentAmount = Number(overrideAmount);
        } else if (isPartnerOffer && partnerOffer) {
            const deposit = parseAmount(partnerOffer.initial_deposit ?? 0);
            const fees = parseAmount(partnerOffer.admin_fees ?? 0);
            downPaymentAmount = deposit + fees;
        } else if (order?.loan_calculation?.down_payment) {
            downPaymentAmount = parseAmount(order.loan_calculation.down_payment);
        }
        if (downPaymentAmount <= 0) {
            alert('Down payment amount is not available for this application.');
            return;
        }

        setProcessingDownPayment(true);
        try {
            await ensureFlutterwave();
            const txRef = 'deposit_' + applicationId + '_' + Date.now();
            const CANDIDATE_KEYS = ['user', 'user_info', 'auth_user', 'current_user', 'profile', 'logged_in_user'];
            let userInfo = null;
            for (const key of CANDIDATE_KEYS) {
                try {
                    const raw = localStorage.getItem(key);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed && typeof parsed === 'object') {
                            userInfo = parsed;
                            break;
                        }
                    }
                } catch (e) {}
            }
            const userEmail = userInfo?.email || userInfo?.user_email || 'customer@troosolar.com';
            const userName = userInfo?.name || userInfo?.full_name
                || (userInfo?.first_name && userInfo?.sur_name ? `${userInfo.first_name} ${userInfo.sur_name}` : null)
                || (userInfo?.first_name && userInfo?.last_name ? `${userInfo.first_name} ${userInfo.last_name}` : null)
                || 'Customer';
            const userPhone = userInfo?.phone || userInfo?.phone_number || '';

            window.FlutterwaveCheckout({
                public_key: FLUTTERWAVE_PUBLIC_KEY,
                tx_ref: txRef,
                amount: downPaymentAmount,
                currency: 'NGN',
                payment_options: 'card,ussd,banktransfer',
                customer: {
                    email: userEmail,
                    name: userName,
                    ...(userPhone ? { phone_number: userPhone } : {}),
                },
                callback: async (response) => {
                    if (response?.status === 'successful') {
                        if (typeof window.closePaymentModal === 'function') {
                            window.closePaymentModal();
                        }
                        try {
                            const txId = response?.transaction_id || response?.id || response?.flw_ref || txRef;
                            const result = await confirmDownPayment(applicationId, txId, downPaymentAmount);
                            if (result) {
                                alert('Down payment successful! Your order will proceed.');
                                if (result.order_id) {
                                    setProcessingDownPayment(false);
                                    navigate(`/bnpl-loans/${result.order_id}`, { replace: true });
                                    return;
                                }
                                fetchApplicationDetails(applicationId);
                            } else {
                                alert('Payment verification failed. Please contact support if amount was debited.');
                            }
                        } catch (err) {
                            console.error('Down payment confirmation error:', err);
                            alert('Payment successful but confirmation failed. Please contact support.');
                        }
                    } else {
                        alert('Payment was not completed. Please try again.');
                    }
                    setProcessingDownPayment(false);
                },
                onclose: () => setProcessingDownPayment(false),
                customizations: {
                    title: isPartnerOffer ? 'Partner Offer Down Payment' : 'BNPL Down Payment',
                    description: `Down payment for Application #${applicationId}`,
                    logo: 'https://yourdomain.com/logo.png',
                },
            });
        } catch (err) {
            console.error('Down payment init failed:', err);
            alert('Failed to initialize payment. Please try again.');
            setProcessingDownPayment(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            const d = new Date(dateString);
            if (Number.isNaN(d.getTime())) return 'N/A';
            return d.toLocaleDateString('en-NG', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return 'N/A';
        }
    };

    /** Backend due date field is payment_date; when the customer actually paid is paid_at. */
    const getInstallmentDueDate = (inst) =>
        inst?.due_date || inst?.payment_date || inst?.dueDate || inst?.paymentDate || null;
    const getInstallmentPaidAt = (inst) =>
        inst?.paid_at ||
        inst?.paidAt ||
        inst?.transaction?.transacted_at ||
        inst?.transaction?.created_at ||
        null;
    const getInstallmentNumber = (inst, index = 0) =>
        inst?.installment_number ??
        inst?.sequence ??
        inst?.display_number ??
        (Number.isFinite(Number(index)) ? Number(index) + 1 : null);

    const formatCurrency = (amount) => {
        if (!amount) return '₦0.00';
        const numAmount = typeof amount === 'string' 
            ? parseFloat(amount.replace(/,/g, '')) 
            : amount;
        return new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(numAmount || 0);
    };

    const renderOrderList = () => {
        if (!orderData?.orders || orderData.orders.length === 0) {
            return (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                    <FileText size={64} className="mx-auto text-gray-400 mb-4" />
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">
                        No BNPL Loans Found
                    </h3>
                    <p className="text-gray-600 mb-6">
                        You don't have any BNPL applications or orders yet.
                    </p>
                    <button
                        onClick={() => navigate('/bnpl')}
                        className="px-6 py-3 bg-[#273e8e] text-white rounded-lg font-semibold hover:bg-[#1a2b6b] transition-colors"
                    >
                        Apply for BNPL
                    </button>
                </div>
            );
        }

        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-800">
                        Your BNPL {orderData.isApplications ? 'Applications' : 'Orders'} ({pagination.total})
                    </h2>
                </div>
                <div className="divide-y divide-gray-200">
                    {orderData.orders.map((item) => {
                        // Handle both orders and applications
                        const isApplication = orderData.isApplications || !item.order_id;
                        const itemId = item.id;
                        const po = item.partner_offer;
                        const hasPartnerOfferTerms = !!(
                            po &&
                            (po.loan_amount != null ||
                                po.initial_deposit != null ||
                                po.repayment_amount != null)
                        );
                        const itemStatus = (() => {
                            if (
                                String(item.status || '').toLowerCase() === 'partner_offer' ||
                                hasPartnerOfferTerms
                            ) {
                                return 'partner_offer';
                            }
                            if (isLoanFullyPaid(item)) return 'payment_complete';
                            return item.status || item.order_status;
                        })();
                        const loanAmount = item.loan_amount || item.loan_summary?.loan_amount;
                        const repaymentDuration = item.repayment_duration || item.loan_summary?.repayment_duration || item.loan_summary?.duration;
                        const displayId = isApplication ? `Application #${itemId}` : `Order #${itemId}`;
                        
                        return (
                            <div
                                key={itemId}
                                className="p-6 hover:bg-gray-50 transition-colors cursor-pointer"
                                onClick={() => {
                                    // If it's an application, navigate using application ID, otherwise use order ID
                                    if (isApplication) {
                                        // For applications, we can show details using the application status endpoint
                                        navigate(`/bnpl-loans/app-${itemId}`);
                                    } else {
                                        navigate(`/bnpl-loans/${itemId}`);
                                    }
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4 flex-1">
                                        {getStatusIcon(itemStatus)}
                                        <div className="flex-1">
                                            <p className="font-semibold text-gray-800">
                                                {displayId}
                                            </p>
                                            {loanAmount && (
                                                <p className="text-sm text-gray-500">
                                                    {formatCurrency(loanAmount)} • {repaymentDuration || 'N/A'} months
                                                </p>
                                            )}
                                            {item.property_address && (
                                                <p className="text-xs text-gray-400 mt-1">
                                                    {item.property_address}, {item.property_state || ''}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(itemStatus)}`}>
                                            {itemStatus?.toUpperCase().replace(/_/g, ' ') || 'PENDING'}
                                        </span>
                                        <ArrowRight className="text-gray-400" size={20} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Pagination */}
                {pagination.last_page > 1 && (
                    <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                            Showing {pagination.current_page} of {pagination.last_page} pages
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => fetchAllOrders(pagination.current_page - 1)}
                                disabled={pagination.current_page === 1}
                                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <span className="px-4 py-2 text-sm font-medium text-gray-700">
                                Page {pagination.current_page} of {pagination.last_page}
                            </span>
                            <button
                                onClick={() => fetchAllOrders(pagination.current_page + 1)}
                                disabled={pagination.current_page === pagination.last_page}
                                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft size={20} className="rotate-180" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Helper function to parse amount (handles strings with commas)
    const parseAmount = (amount) => {
        if (!amount) return 0;
        if (typeof amount === 'number') return amount;
        // Remove commas and parse
        return parseFloat(String(amount).replace(/,/g, '')) || 0;
    };

    // Calculate repayment summary from loan calculation and schedule
    const calculateRepaymentSummary = (loanCalc, repaymentSchedule, installmentsWithHistory, loanDetails) => {
        if (!loanCalc && !loanDetails) return null;

        const totalFromSnapshot =
            loanDetails &&
            (loanDetails.totalRepaymentAmount != null || loanDetails.totalRepayment != null)
                ? parseAmount(loanDetails.totalRepaymentAmount ?? loanDetails.totalRepayment)
                : 0;
        const totalAmount =
            totalFromSnapshot > 0
                ? totalFromSnapshot
                : parseAmount(
                      loanCalc?.total_repayment ||
                          loanCalc?.total_amount ||
                          loanCalc?.loan_amount
                  );
        
        // Calculate paid amount from installments with history
        let paidAmount = 0;
        if (installmentsWithHistory?.history) {
            paidAmount = installmentsWithHistory.history.reduce((sum, inst) => {
                if (inst.status === 'paid' || inst.payment_status === 'paid') {
                    return sum + parseAmount(inst.amount || inst.payment_amount);
                }
                return sum;
            }, 0);
        } else if (repaymentSchedule && repaymentSchedule.length > 0) {
            paidAmount = repaymentSchedule.reduce((sum, inst) => {
                if (inst.status === 'paid' || inst.payment_status === 'paid') {
                    return sum + parseAmount(inst.amount || inst.payment_amount);
                }
                return sum;
            }, 0);
        }
        
        const pendingAmount = totalAmount - paidAmount;
        
        // Calculate overdue amount
        let overdueAmount = 0;
        if (installmentsWithHistory?.history) {
            overdueAmount = installmentsWithHistory.history.reduce((sum, inst) => {
                const dueDate = new Date(inst.due_date || inst.payment_date);
                const today = new Date();
                if ((inst.status === 'pending' || inst.payment_status === 'pending') && dueDate < today) {
                    return sum + parseAmount(inst.amount || inst.payment_amount);
                }
                return sum;
            }, 0);
        } else if (repaymentSchedule && repaymentSchedule.length > 0) {
            overdueAmount = repaymentSchedule.reduce((sum, inst) => {
                const dueDate = new Date(inst.due_date || inst.payment_date);
                const today = new Date();
                if ((inst.status === 'pending' || inst.payment_status === 'pending') && dueDate < today) {
                    return sum + parseAmount(inst.amount || inst.payment_amount);
                }
                return sum;
            }, 0);
        }
        
        return {
            total_amount: totalAmount,
            paid_amount: paidAmount,
            pending_amount: pendingAmount,
            overdue_amount: overdueAmount
        };
    };

    // Determine the correct status to display
    const getDisplayStatus = (order) => {
        const isApplication = order.isApplication;
        const loanApp = order.loan_application || order.application || (isApplication ? order : null);
        const hasPartnerOfferTerms = !!(
            order?.partner_offer &&
            (order.partner_offer.loan_amount != null ||
                order.partner_offer.initial_deposit != null ||
                order.partner_offer.repayment_amount != null)
        );

        // Fully repaid BNPL orders should show Payment Complete (not APPROVED).
        if (!isApplication && isLoanFullyPaid(order)) {
            return 'payment_complete';
        }

        // For orders with loan applications, prioritize loan application status
        if (!isApplication && loanApp) {
            // If loan is approved and down payment is completed, show as approved/active
            if (loanApp.status?.toLowerCase() === 'approved' && 
                (loanApp.down_payment_completed || order.payment_status === 'paid')) {
                return 'approved';
            }
            // If loan application has a status, use it
            if (loanApp.status) {
                return loanApp.status;
            }
        }

        // For applications, use application status (partner_offer must win over a stale pending,
        // but must not override approved/rejected after down payment).
        if (isApplication) {
            const appStatus = String(order.status || loanApp?.status || '').toLowerCase();
            if (appStatus === 'payment_complete' || isLoanFullyPaid(order)) {
                return 'payment_complete';
            }
            if (appStatus === 'partner_offer') {
                return 'partner_offer';
            }
            if (
                hasPartnerOfferTerms &&
                (appStatus === 'pending' || appStatus === 'processing' || !appStatus)
            ) {
                return 'partner_offer';
            }
            if (order.status) return order.status;
            if (loanApp?.status) return loanApp.status;
        }

        // For orders, check both order_status and status
        const orderStatus = order.order_status || order.status;

        // If payment is paid but order status is pending, and there's an approved loan, show approved
        if (order.payment_status === 'paid' && 
            orderStatus?.toLowerCase() === 'pending' && 
            loanApp?.status?.toLowerCase() === 'approved') {
            return 'approved';
        }

        return orderStatus || order.status || 'pending';
    };

    const isApprovedOrPaidComplete = (status) => {
        const s = String(status || '').toLowerCase();
        return s === 'approved' || s === 'payment_complete';
    };

    const renderOrderDetails = () => {
        if (!orderData || orderData.isList) return null;

        const order = orderData;
        const isApplication = order.isApplication;
        const loanApp = order.loan_application || order.application || (isApplication ? order : null);
        const loanCalc = order.loan_calculation || loanApp?.loan_calculation;
        const ld = order.loan_details;
        const repaymentSchedule = order.repayment_schedule || [];
        const repaymentHistory = order.repayment_history || [];
        
        // Get the correct display status
        const displayStatus = getDisplayStatus(order);
        const statusLower = String(displayStatus || '').toLowerCase();
        const isPartnerOfferStatus = statusLower === 'partner_offer';
        const poTerms = order.partner_offer || {};
        const laPartner = loanApp || {};
        // Partner offer terms must stay visible after down payment (status becomes approved).
        const hasPartnerOfferTerms = !!(
            (poTerms.loan_amount != null && poTerms.loan_amount !== '') ||
            (poTerms.initial_deposit != null && poTerms.initial_deposit !== '') ||
            (poTerms.repayment_amount != null && poTerms.repayment_amount !== '') ||
            laPartner.partner_offer_loan_amount != null ||
            laPartner.partner_offer_initial_deposit != null ||
            laPartner.partner_offer_repayment_amount != null
        );
        const showPartnerOfferSection = isPartnerOfferStatus || hasPartnerOfferTerms;
        const partnerFinancingPath = String(
            order?.financing_path
                || loanApp?.financing_path
                || order?.loan_plan_snapshot?.financing?.path
                || loanApp?.loan_plan_snapshot?.financing?.path
                || ''
        ).toLowerCase();
        // Partner financing: Troosolar flow ends after down payment; monthly debits are with the partner.
        const isPartnerFinancingPath =
            showPartnerOfferSection
            || partnerFinancingPath === 'partner'
            || String(order?.credit_check_method || loanApp?.credit_check_method || '').toLowerCase() === 'partner';
        const paymentStatusPaid = ['paid', 'completed', 'success'].includes(
            String(order.payment_status || '').toLowerCase()
        );
        // Order view always means down payment was collected; application may only set flags.
        const downPaymentDone = !!(
            order.down_payment_completed
            || order.order_id
            || (!isApplication && order.id)
            || paymentStatusPaid
        );
        const partnerDownPaymentDone = isPartnerFinancingPath && downPaymentDone;
        const hasCounterOfferTerms = !!(
            order.had_counter_offer ||
            (order.counter_offer_min_deposit != null && order.counter_offer_min_deposit !== '' &&
                order.counter_offer_min_tenor != null && order.counter_offer_min_tenor !== '') ||
            (loanApp?.counter_offer_min_deposit != null && loanApp?.counter_offer_min_tenor != null) ||
            order.counter_offer_details ||
            loanApp?.counter_offer_details
        );
        const isCounterOfferPending = statusLower === 'counter_offer';
        // After accept / approval / down payment: keep original choice + counter offer breakdown.
        const showCounterOfferHistorySection =
            hasCounterOfferTerms && !isCounterOfferPending && !showPartnerOfferSection;
        // Installments / overdue: Troosolar path only after down payment — never partner financing.
        const showRepaymentUi =
            !isPartnerFinancingPath &&
            (!isApplication || !!(order.down_payment_completed || order.order_id));

        const toNum = (v) => {
            const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
            return Number.isFinite(n) ? n : null;
        };
        const pickPositive = (...vals) => {
            for (const v of vals) {
                const n = toNum(v);
                if (n !== null && n > 0) return n;
            }
            for (const v of vals) {
                const n = toNum(v);
                if (n !== null) return n;
            }
            return null;
        };
        const pickText = (...vals) => {
            for (const v of vals) {
                if (v === 0) return '0';
                const s = String(v ?? '').trim();
                if (s) return s;
            }
            return '';
        };

        const computedRepaymentSummary = calculateRepaymentSummary(
            loanCalc,
            repaymentSchedule,
            installmentsWithHistory,
            ld
        );
        let repaymentSummary = {
            ...(computedRepaymentSummary && typeof computedRepaymentSummary === 'object'
                ? computedRepaymentSummary
                : {}),
            ...(order.repayment_summary && typeof order.repayment_summary === 'object'
                ? order.repayment_summary
                : {}),
        };
        const totalRepaymentFallback = pickPositive(
            ld?.totalRepaymentAmount,
            ld?.totalRepayment,
            parseAmount(loanCalc?.total_repayment),
            loanApp?.loan_amount,
            computedRepaymentSummary?.total_amount
        );
        const apiTotalNum = toNum(repaymentSummary.total_amount);
        const paidAmtNum = toNum(repaymentSummary.paid_amount) ?? 0;
        if (apiTotalNum === null || apiTotalNum <= 0) {
            const resolved = totalRepaymentFallback ?? 0;
            repaymentSummary = {
                ...repaymentSummary,
                total_amount: resolved,
                pending_amount: Math.max(resolved - paidAmtNum, 0),
            };
        }
        const displayLoanAmount = pickPositive(
            ld?.principal,
            ld?.totalLoanAmount,
            loanCalc?.principal_amount,
            loanCalc?.loan_amount,
            loanApp?.loan_amount,
            order?.loan_amount
        );
        const displayTotalRepaymentForDetails = pickPositive(
            ld?.totalRepaymentAmount,
            ld?.totalRepayment,
            parseAmount(loanCalc?.total_repayment),
            loanApp?.loan_amount,
            displayLoanAmount
        );
        const displayRepaymentDuration = pickText(
            ld?.tenor,
            loanApp?.repayment_duration,
            loanCalc?.repayment_duration,
            order?.loan_details?.repayment_duration
        );
        const displayCreditCheckMethod = pickText(
            loanApp?.credit_check_method,
            order?.credit_check_method
        );
        const displayCustomerType = pickText(
            loanApp?.customer_type,
            order?.customer_type
        );

        return (
            <div className="space-y-6">
                {/* Header Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            {getStatusIcon(displayStatus)}
                            <div>
                                <h2 className="text-2xl font-bold text-gray-800">
                                    {isApplication ? `BNPL Application #${order.id}` : `BNPL Order #${order.order_number || order.id}`}
                                </h2>
                                <p className="text-sm text-gray-500">
                                    {isApplication ? 'Application' : 'Order'} created on {formatDate(order.created_at)}
                                </p>
                            </div>
                        </div>
                        <span className={`px-4 py-2 rounded-full text-sm font-semibold border ${getStatusBadge(displayStatus)}`}>
                            {displayStatus?.toUpperCase().replace(/_/g, ' ') || 'PENDING'}
                        </span>
                    </div>
                </div>

                {/* Counter Offer Section — only while offer is pending (hide after acceptance) */}
                {isApplication && displayStatus?.toLowerCase() === 'counter_offer' && (
                    <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <AlertCircle size={32} className="text-yellow-600" />
                            <h3 className="text-2xl font-bold text-yellow-800">Counter Offer Available</h3>
                        </div>
                        <p className="text-gray-700 mb-6">
                            Your loan application has been partially approved with a counter offer. Please review the new terms:
                        </p>
                        <div className="bg-white border border-yellow-200 p-6 rounded-lg mb-6">
                            <h4 className="font-bold text-gray-800 mb-4">Counter Offer Terms:</h4>
                            {order.admin_notes && (
                                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <p className="text-sm text-gray-700">
                                        <strong>Admin Note:</strong> {order.admin_notes}
                                    </p>
                                </div>
                            )}
                            <div className="space-y-3 text-sm">
                                {/* Same wording/order as BNPL "Review Your Loan Plan" / Loan Summary */}
                                {(() => {
                                    const d = order.counter_offer_details || {};
                                    const toNum = (v) => {
                                        if (v === null || v === undefined || v === '') return null;
                                        const n = parseAmount(v);
                                        return Number.isFinite(n) ? n : null;
                                    };
                                    const pick = (...vals) => {
                                        for (const v of vals) {
                                            const n = toNum(v);
                                            if (n !== null && n !== 0) return n;
                                            if (n === 0) return 0;
                                        }
                                        return null;
                                    };
                                    const depositPct = pick(d.deposit_percent, d.depositPercent);
                                    const upfront = pick(
                                        d.upfront_deposit_total,
                                        d.down_payment,
                                        order.counter_offer_min_deposit
                                    );
                                    const totalLoan = pick(d.total_loan_amount, d.loan_amount);
                                    const interestRate = pick(d.interest_rate, d.interestRate);
                                    const totalInterest = pick(d.total_interest_amount);
                                    const totalRepayment = pick(
                                        d.total_repayment_amount,
                                        d.total_amount
                                    );
                                    const monthly = pick(
                                        d.monthly_repayment_amount,
                                        d.monthly_payment
                                    );
                                    const tenor = pick(
                                        d.repayment_duration,
                                        order.counter_offer_min_tenor
                                    );
                                    const insuranceFee = pick(d.insurance_fee);
                                    const managementFee = pick(d.management_fee);
                                    const legalFee = pick(d.legal_fee);
                                    const adminFees = pick(d.admin_fees_total);
                                    const insurancePct = pick(d.insurance_pct) ?? 1;
                                    const managementPct = pick(d.management_pct) ?? 1;
                                    const legalPct = pick(d.legal_pct) ?? 1;
                                    const depositLabel = depositPct
                                        ? `Initial Deposit (${depositPct}%) + Total Administrative Fees`
                                        : 'Initial Deposit + Total Administrative Fees';
                                    const interestLabel = interestRate != null && tenor
                                        ? `Total Interest Amount (${interestRate}% × ${tenor} mo)`
                                        : 'Total Interest Amount';
                                    const row = (label, value, opts = {}) => {
                                        if (value === null || value === undefined) return null;
                                        return (
                                            <div
                                                key={label}
                                                className={`flex justify-between items-center gap-3 ${opts.border ? 'border-t border-yellow-200 pt-2 mt-1' : ''}`}
                                            >
                                                <span className={`text-gray-700 ${opts.boldLabel ? 'font-semibold' : ''}`}>
                                                    {opts.num != null ? `${opts.num}. ` : ''}{label}
                                                </span>
                                                <span className={`font-bold tabular-nums ${opts.accent || 'text-gray-800'}`}>
                                                    {opts.suffix || formatCurrency(value)}
                                                </span>
                                            </div>
                                        );
                                    };
                                    return (
                                        <>
                                            {row(depositLabel, upfront, { num: 1, boldLabel: true })}
                                            {row('Total Loan Amount', totalLoan, { num: 2 })}
                                            {interestRate != null && (
                                                <div className="flex justify-between items-center gap-3">
                                                    <span className="text-gray-700">3. Interest Rate (monthly)</span>
                                                    <span className="font-bold text-[#273e8e] tabular-nums">
                                                        {Number(interestRate).toFixed(2)}%
                                                    </span>
                                                </div>
                                            )}
                                            {row(interestLabel, totalInterest, { num: 4 })}
                                            {row('Total Repayment Amount', totalRepayment, { num: 5 })}
                                            {row('Monthly Repayment Amount', monthly, {
                                                num: 6,
                                                boldLabel: true,
                                                accent: 'text-[#273e8e]',
                                            })}
                                            {tenor != null && (
                                                <div className="flex justify-between items-center gap-3 border-t border-yellow-200 pt-2 mt-1">
                                                    <span className="text-gray-700">7. Loan Tenor</span>
                                                    <span className="font-bold text-[#273e8e] tabular-nums">
                                                        {tenor} {tenor === 1 ? 'month' : 'months'}
                                                    </span>
                                                </div>
                                            )}
                                            {(insuranceFee != null || managementFee != null || legalFee != null) && (
                                                <div className="mt-4 pt-3 border-t border-yellow-200">
                                                    <p className="font-semibold text-gray-800 mb-1">Administrative Fees</p>
                                                    <p className="text-xs text-gray-600 mb-2">
                                                        Insurance is calculated on the bundle price only. Management and legal fees are calculated on the loan amount.
                                                    </p>
                                                    <div className="space-y-1">
                                                        {row(
                                                            `Insurance Fee (${insurancePct}% of bundle price)`,
                                                            insuranceFee,
                                                            { num: 1 }
                                                        )}
                                                        {row(
                                                            `Management Fee (${managementPct}% of the loan amount)`,
                                                            managementFee,
                                                            { num: 2 }
                                                        )}
                                                        {row(
                                                            `Legal Fee (${legalPct}% of the loan amount)`,
                                                            legalFee,
                                                            { num: 3 }
                                                        )}
                                                        {row('Total Administrative Fees', adminFees, {
                                                            boldLabel: true,
                                                            border: true,
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-6">
                            <strong>Note:</strong> If you accept the counter offer or re-apply, you do not need to pay for credit checks again.
                        </p>
                        <div className="space-y-3">
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!id || !id.startsWith('app-')) return;
                                    const applicationId = id.replace('app-', '');
                                    
                                    setProcessingCounterOffer(true);
                                    try {
                                        const token = localStorage.getItem('access_token');
                                        if (!token) {
                                            alert('Please login to accept the counter offer');
                                            return;
                                        }

                                        // Prefer corrected plan from counter_offer_details (insurance on bundle price)
                                        const d = order.counter_offer_details || {};
                                        const minimumDeposit = parseAmount(
                                            d.upfront_deposit_total
                                            || d.down_payment
                                            || order.counter_offer_min_deposit
                                            || loanCalc?.down_payment
                                            || 0
                                        );
                                        const minimumTenor = parseInt(
                                            d.repayment_duration
                                            || order.counter_offer_min_tenor
                                            || loanCalc?.repayment_duration
                                            || loanCalc?.tenor
                                            || 12,
                                            10
                                        );

                                        const response = await axios.post(
                                            API.BNPL_COUNTEROFFER_ACCEPT,
                                            {
                                                application_id: parseInt(applicationId),
                                                minimum_deposit: minimumDeposit,
                                                minimum_tenor: parseInt(minimumTenor)
                                            },
                                            {
                                                headers: {
                                                    Authorization: `Bearer ${token}`,
                                                    Accept: 'application/json'
                                                }
                                            }
                                        );

                                        if (response.data.status === 'success') {
                                            alert('Counter offer accepted successfully! Your application will be updated.');
                                            // Refresh the application details
                                            fetchApplicationDetails(applicationId);
                                        } else {
                                            alert(response.data.message || 'Failed to accept counter offer. Please try again.');
                                        }
                                    } catch (error) {
                                        console.error('Error accepting counter offer:', error);
                                        alert(error.response?.data?.message || 'Failed to accept counter offer. Please try again.');
                                    } finally {
                                        setProcessingCounterOffer(false);
                                    }
                                }}
                                disabled={processingCounterOffer}
                                className="w-full bg-[#273e8e] text-white py-4 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {processingCounterOffer ? 'Processing...' : 'Accept Counter Offer'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const applicationId = String(order?.id || '').trim();
                                    if (!applicationId) {
                                        navigate('/bnpl');
                                        return;
                                    }
                                    navigate(`/bnpl?reapply=1&priorApplicationId=${applicationId}&skipCreditCheckFee=1`);
                                }}
                                className="w-full border-2 border-gray-300 text-gray-700 py-4 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                            >
                                Re-apply with Different Terms (No extra credit check fee)
                            </button>
                        </div>
                    </div>
                )}

                {/* Counter offer history — original choice + counter offer (after accept / approval / down payment) */}
                {showCounterOfferHistorySection && (() => {
                    const d = order.counter_offer_details || loanApp?.counter_offer_details || {};
                    const pickCo = (...vals) => {
                        for (const v of vals) {
                            if (v === null || v === undefined || v === '') continue;
                            const n = parseAmount(v);
                            if (Number.isFinite(n)) return n;
                        }
                        return null;
                    };
                    const depositPct = pickCo(d.deposit_percent, d.depositPercent);
                    const upfront = pickCo(
                        d.upfront_deposit_total,
                        d.down_payment,
                        order.counter_offer_min_deposit,
                        loanApp?.counter_offer_min_deposit
                    );
                    const totalLoan = pickCo(d.total_loan_amount, d.loan_amount);
                    const interestRate = pickCo(d.interest_rate, d.interestRate);
                    const totalInterest = pickCo(d.total_interest_amount);
                    const totalRepayment = pickCo(d.total_repayment_amount, d.total_amount);
                    const monthly = pickCo(d.monthly_repayment_amount, d.monthly_payment);
                    const tenor = pickCo(
                        d.repayment_duration,
                        order.counter_offer_min_tenor,
                        loanApp?.counter_offer_min_tenor
                    );
                    const insuranceFee = pickCo(d.insurance_fee);
                    const managementFee = pickCo(d.management_fee);
                    const legalFee = pickCo(d.legal_fee);
                    const adminFees = pickCo(d.admin_fees_total);
                    const insurancePct = pickCo(d.insurance_pct) ?? 1;
                    const managementPct = pickCo(d.management_pct) ?? 1;
                    const legalPct = pickCo(d.legal_pct) ?? 1;
                    const depositLabel = depositPct
                        ? `Initial Deposit (${depositPct}%) + Total Administrative Fees`
                        : 'Initial Deposit + Total Administrative Fees';
                    const interestLabel = interestRate != null && tenor
                        ? `Total Interest Amount (${interestRate}% × ${tenor} mo)`
                        : 'Total Interest Amount';

                    const pickOrig = (...vals) => {
                        for (const v of vals) {
                            if (v === null || v === undefined || v === '') continue;
                            const n = parseAmount(v);
                            if (Number.isFinite(n)) return n;
                        }
                        return 0;
                    };
                    const origTenor = pickOrig(ld?.tenor, ld?.repayment_duration);
                    const origDepositPctRaw = pickOrig(ld?.depositPercent, ld?.deposit_percent);
                    const origLoanAmount = pickOrig(ld?.totalLoanAmount, ld?.principal);
                    const origInterestRate = Number(ld?.interestRate ?? ld?.interest_rate);
                    const origTotalInterest = pickOrig(ld?.totalInterestAmount, ld?.totalInterest) || (
                        origLoanAmount > 0 && Number.isFinite(origInterestRate) && origTenor > 0
                            ? Math.round(origLoanAmount * (origInterestRate / 100) * origTenor * 100) / 100
                            : 0
                    );
                    const origRepayment = pickOrig(ld?.totalRepaymentAmount, ld?.totalRepayment)
                        || (origLoanAmount + origTotalInterest);
                    const origMonthly = pickOrig(ld?.monthlyRepaymentAmount, ld?.monthlyRepayment)
                        || (origTenor > 0 ? Math.round((origRepayment / origTenor) * 100) / 100 : 0);
                    const origDepositPctLabel = origDepositPctRaw > 0
                        ? `${Math.abs(origDepositPctRaw - Math.round(origDepositPctRaw)) < 0.05
                            ? Math.round(origDepositPctRaw)
                            : Math.round(origDepositPctRaw * 100) / 100}%`
                        : null;
                    const originalRows = [
                        {
                            label: origDepositPctLabel
                                ? `Initial Deposit (${origDepositPctLabel}) + Total Administrative Fees`
                                : 'Initial Deposit + Total Administrative Fees',
                            value: pickOrig(ld?.depositAmount, ld?.down_payment),
                        },
                        { label: 'Total Loan Amount', value: origLoanAmount },
                        {
                            label: Number.isFinite(origInterestRate) && origTenor > 0
                                ? `Total Interest Amount (${origInterestRate}% × ${origTenor} mo)`
                                : 'Total Interest Amount',
                            value: origTotalInterest,
                        },
                        { label: 'Total Repayment Amount', value: origRepayment },
                        { label: 'Monthly Repayment Amount', value: origMonthly },
                    ];
                    const hasOriginalChoice = originalRows.some((r) => Number(r.value) > 0) || origTenor > 0;

                    const canPayDown =
                        isApplication &&
                        (statusLower === 'approved' || statusLower === 'counter_offer_accepted') &&
                        !downPaymentDone &&
                        upfront > 0;

                    const coRow = (label, value, opts = {}) => {
                        if (value === null || value === undefined) return null;
                        return (
                            <div
                                key={label}
                                className={`bg-white rounded-lg p-4 border border-yellow-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 ${opts.border ? 'border-t mt-1 pt-3' : ''}`}
                            >
                                <p className={`text-sm text-gray-800 ${opts.bold ? 'font-semibold' : 'font-medium'}`}>
                                    {opts.num != null ? `${opts.num}. ` : ''}{label}
                                </p>
                                <p className={`text-xl font-bold tabular-nums ${opts.accent || 'text-gray-800'}`}>
                                    {formatCurrency(value)}
                                </p>
                            </div>
                        );
                    };

                    return (
                        <div className="space-y-6">
                            {hasOriginalChoice && (
                                <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-xl shadow-sm border border-gray-200 p-6">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="text-[#273e8e] text-2xl font-bold" aria-hidden="true">₦</span>
                                        <h3 className="text-xl font-semibold text-gray-800">Your Original Choice</h3>
                                    </div>
                                    <p className="text-sm text-gray-600 mb-4">
                                        What you selected when you applied (Loan Summary).
                                    </p>
                                    <div className="space-y-3">
                                        {originalRows.map((row, index) => (
                                            <div
                                                key={`co-orig-${row.label}`}
                                                className="bg-white rounded-lg p-4 border border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                                            >
                                                <p className="text-sm font-medium text-gray-800">{row.label}</p>
                                                <p className={`text-xl font-bold ${
                                                    index === 4 ? 'text-[#273e8e]' : 'text-gray-800'
                                                }`}>
                                                    {formatCurrency(row.value)}
                                                </p>
                                            </div>
                                        ))}
                                        <div className="border-t border-gray-200 pt-3 mt-1">
                                            <div className="bg-white rounded-lg p-4 border border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                                <p className="text-sm font-medium text-gray-800">Loan Tenor</p>
                                                <p className="text-xl font-bold text-[#273e8e]">
                                                    {origTenor > 0
                                                        ? `${origTenor} ${origTenor === 1 ? 'month' : 'months'}`
                                                        : '—'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <AlertCircle size={28} className="text-yellow-600" />
                                    <h3 className="text-xl font-bold text-yellow-800">Counter Offer</h3>
                                </div>
                                <p className="text-sm text-yellow-900 mb-4">
                                    Terms from Troosolar&apos;s counter offer
                                    {statusLower === 'counter_offer_accepted' || statusLower === 'approved'
                                        ? ' (accepted).'
                                        : '.'}
                                </p>
                                {(order.admin_notes || loanApp?.admin_notes) && (
                                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                        <p className="text-sm text-gray-700">
                                            <strong>Admin Note:</strong> {order.admin_notes || loanApp?.admin_notes}
                                        </p>
                                    </div>
                                )}
                                <div className="space-y-3 text-sm">
                                    {coRow(depositLabel, upfront, { num: 1, bold: true })}
                                    {coRow('Total Loan Amount', totalLoan, { num: 2 })}
                                    {interestRate != null && (
                                        <div className="bg-white rounded-lg p-4 border border-yellow-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                            <p className="text-sm font-medium text-gray-800">3. Interest Rate (monthly)</p>
                                            <p className="text-xl font-bold text-[#273e8e] tabular-nums">
                                                {Number(interestRate).toFixed(2)}%
                                            </p>
                                        </div>
                                    )}
                                    {coRow(interestLabel, totalInterest, { num: 4 })}
                                    {coRow('Total Repayment Amount', totalRepayment, { num: 5 })}
                                    {coRow('Monthly Repayment Amount', monthly, {
                                        num: 6,
                                        bold: true,
                                        accent: 'text-[#273e8e]',
                                    })}
                                    {tenor != null && (
                                        <div className="border-t border-yellow-200 pt-3 mt-1">
                                            <div className="bg-white rounded-lg p-4 border border-yellow-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                                <p className="text-sm font-medium text-gray-800">7. Loan Tenor</p>
                                                <p className="text-xl font-bold text-[#273e8e] tabular-nums">
                                                    {tenor} {tenor === 1 ? 'month' : 'months'}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                    {(insuranceFee != null || managementFee != null || legalFee != null) && (
                                        <div className="mt-4 pt-3 border-t border-yellow-200">
                                            <p className="font-semibold text-gray-800 mb-1">Administrative Fees</p>
                                            <p className="text-xs text-gray-600 mb-2">
                                                Insurance is calculated on the bundle price only. Management and legal fees are calculated on the loan amount.
                                            </p>
                                            <div className="space-y-2">
                                                {coRow(`Insurance Fee (${insurancePct}% of bundle price)`, insuranceFee, { num: 1 })}
                                                {coRow(`Management Fee (${managementPct}% of the loan amount)`, managementFee, { num: 2 })}
                                                {coRow(`Legal Fee (${legalPct}% of the loan amount)`, legalFee, { num: 3 })}
                                                {coRow('Total Administrative Fees', adminFees, { bold: true })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {canPayDown && (
                                    <div className="mt-4 bg-white rounded-lg p-4 border-2 border-[#273e8e]">
                                        <p className="text-sm text-gray-600 mb-3">
                                            Pay your initial deposit (counter offer) of{' '}
                                            <strong>{formatCurrency(upfront)}</strong> to proceed.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => handlePayDownPayment(upfront)}
                                            disabled={processingDownPayment}
                                            className="w-full bg-[#273e8e] text-white py-3 rounded-xl font-bold hover:bg-[#1a2b6b] disabled:opacity-50"
                                        >
                                            {processingDownPayment ? 'Processing…' : `Pay Down Payment (${formatCurrency(upfront)})`}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* Partner Offer — keep original customer choice + show partner terms (even after approval / on order view) */}
                {showPartnerOfferSection && (() => {
                    const po = {
                        ...(order.partner_offer || {}),
                    };
                    if (po.loan_amount == null && loanApp?.partner_offer_loan_amount != null) {
                        po.interest_rate = loanApp.partner_offer_interest_rate;
                        po.deposit_percent = loanApp.partner_offer_deposit_percent;
                        po.initial_deposit = loanApp.partner_offer_initial_deposit;
                        po.admin_fees = loanApp.partner_offer_admin_fees;
                        po.repayment_amount = loanApp.partner_offer_repayment_amount;
                        po.loan_amount = loanApp.partner_offer_loan_amount;
                        po.tenor = loanApp.partner_offer_tenor;
                        po.writeup = loanApp.partner_offer_writeup;
                        po.documents = loanApp.partner_offer_documents || [];
                    }
                    const deposit = parseAmount(po.initial_deposit ?? 0);
                    const fees = parseAmount(po.admin_fees ?? 0);
                    const upfrontDue = deposit + fees;
                    const loanAmount = parseAmount(po.loan_amount ?? 0);
                    const tenor = Number(po.tenor) || 0;
                    const interestRate = po.interest_rate != null ? Number(po.interest_rate) : null;
                    // Loan Summary formula: interest = loan × (rate%/100) × tenor; repayment = loan + interest
                    const storedRepayment = parseAmount(po.repayment_amount ?? 0);
                    const computedInterest =
                        loanAmount > 0 && interestRate != null && Number.isFinite(interestRate) && tenor > 0
                            ? Math.round(loanAmount * (interestRate / 100) * tenor * 100) / 100
                            : 0;
                    const totalInterest = computedInterest > 0
                        ? computedInterest
                        : (storedRepayment > 0 && loanAmount > 0
                            ? Math.max(storedRepayment - loanAmount, 0)
                            : 0);
                    const repaymentAmount = computedInterest > 0
                        ? Math.round((loanAmount + computedInterest) * 100) / 100
                        : storedRepayment;
                    const monthlyRepayment = tenor > 0 && repaymentAmount > 0
                        ? Math.round((repaymentAmount / tenor) * 100) / 100
                        : 0;
                    const interestLabel = interestRate != null && tenor > 0
                        ? `Total Interest Amount (${interestRate}% × ${tenor} mo)`
                        : 'Total Interest Amount';
                    // Use the partner-offer % (what admin set), not the customer's original snapshot %.
                    const partnerPct = Number(po.deposit_percent ?? po.depositPercent);
                    let depositPct = Number.isFinite(partnerPct) && partnerPct > 0 && partnerPct <= 100
                        ? partnerPct
                        : 0;
                    if (!(depositPct > 0) && deposit > 0 && loanAmount > 0) {
                        depositPct = (deposit / (deposit + loanAmount)) * 100;
                    }
                    const depositPctLabel = depositPct > 0
                        ? `${Math.abs(depositPct - Math.round(depositPct)) < 0.05
                            ? Math.round(depositPct)
                            : Math.round(depositPct * 100) / 100}%`
                        : null;
                    const offerRows = [
                        {
                            label: depositPctLabel
                                ? (fees > 0
                                    ? `Initial Deposit (${depositPctLabel}) + Total Administrative Fees`
                                    : `Initial Deposit (${depositPctLabel})`)
                                : (fees > 0
                                    ? 'Initial Deposit + Total Administrative Fees'
                                    : 'Initial Deposit'),
                            value: upfrontDue,
                        },
                        { label: 'Total Loan Amount', value: loanAmount },
                        { label: interestLabel, value: totalInterest },
                        { label: 'Total Repayment Amount', value: repaymentAmount },
                        { label: 'Monthly Repayment Amount', value: monthlyRepayment },
                    ];
                    // Never show Pay Down Payment after deposit is done (incl. order view / paid status).
                    const canPay =
                        isApplication &&
                        upfrontDue > 0 &&
                        !downPaymentDone;

                    // Customer's original application choice (from snapshot) — must stay visible with the offer.
                    const pickOrig = (...vals) => {
                        for (const v of vals) {
                            if (v === null || v === undefined || v === '') continue;
                            const n = parseAmount(v);
                            if (Number.isFinite(n)) return n;
                        }
                        return 0;
                    };
                    const snapPath = String(
                        order?.financing_path
                            || loanApp?.financing_path
                            || order?.loan_plan_snapshot?.financing?.path
                            || loanApp?.loan_plan_snapshot?.financing?.path
                            || ''
                    ).toLowerCase();
                    const isPartnerFinancingOrig =
                        snapPath === 'partner'
                        || String(order?.credit_check_method || loanApp?.credit_check_method || '').toLowerCase() === 'partner';
                    const origTenor = pickOrig(ld?.tenor, loanCalc?.repayment_duration, loanApp?.repayment_duration);
                    const origDepositPctRaw = pickOrig(ld?.depositPercent, ld?.deposit_percent);
                    const origTotalAmount = pickOrig(
                        ld?.totalAmount, ld?.grandTotal, ld?.invoiceGrandTotal, loanCalc?.total_amount
                    );
                    const origInitialDeposit = pickOrig(
                        ld?.baseDepositAmount, ld?.depositAmount, ld?.down_payment, loanCalc?.down_payment
                    );
                    const origLoanAmount = pickOrig(
                        ld?.totalLoanAmount, ld?.principal, loanCalc?.principal_amount
                    ) || Math.max(origTotalAmount - origInitialDeposit, 0);
                    const origInterestRate = Number(ld?.interestRate ?? ld?.interest_rate ?? loanCalc?.interest_rate);
                    const origTotalInterest = pickOrig(
                        ld?.totalInterestAmount, ld?.totalInterest
                    ) || (
                        origLoanAmount > 0 && Number.isFinite(origInterestRate) && origTenor > 0
                            ? Math.round(origLoanAmount * (origInterestRate / 100) * origTenor * 100) / 100
                            : 0
                    );
                    const origRepayment = pickOrig(
                        ld?.totalRepaymentAmount, ld?.totalRepayment, loanCalc?.total_repayment
                    ) || (origLoanAmount + origTotalInterest);
                    const origMonthly = pickOrig(
                        ld?.monthlyRepaymentAmount, ld?.monthlyRepayment, loanCalc?.monthly_repayment
                    ) || (origTenor > 0 ? Math.round((origRepayment / origTenor) * 100) / 100 : 0);
                    const origDepositPctLabel = origDepositPctRaw > 0
                        ? `${Math.abs(origDepositPctRaw - Math.round(origDepositPctRaw)) < 0.05
                            ? Math.round(origDepositPctRaw)
                            : Math.round(origDepositPctRaw * 100) / 100}%`
                        : (origTotalAmount > 0 && origInitialDeposit > 0
                            ? `${Math.round((origInitialDeposit / origTotalAmount) * 100)}%`
                            : null);
                    const originalRows = isPartnerFinancingOrig
                        ? [
                            { label: 'Total Amount', value: origTotalAmount },
                            {
                                label: origDepositPctLabel
                                    ? `Initial Deposit (${origDepositPctLabel})`
                                    : 'Initial Deposit',
                                value: origInitialDeposit,
                                accent: 'red',
                            },
                            { label: 'Total Loan Amount', value: origLoanAmount },
                        ]
                        : [
                            {
                                label: origDepositPctLabel
                                    ? `Initial Deposit (${origDepositPctLabel}) + Total Administrative Fees`
                                    : 'Initial Deposit + Total Administrative Fees',
                                value: pickOrig(ld?.depositAmount, loanCalc?.down_payment, origInitialDeposit),
                            },
                            { label: 'Total Loan Amount', value: origLoanAmount },
                            {
                                label: Number.isFinite(origInterestRate) && origTenor > 0
                                    ? `Total Interest Amount (${origInterestRate}% × ${origTenor} mo)`
                                    : 'Total Interest Amount',
                                value: origTotalInterest,
                            },
                            { label: 'Total Repayment Amount', value: origRepayment },
                            { label: 'Monthly Repayment Amount', value: origMonthly },
                        ];
                    const hasOriginalChoice = originalRows.some((r) => Number(r.value) > 0) || origTenor > 0;

                    return (
                    <div className="space-y-6">
                        {hasOriginalChoice && (
                            <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-xl shadow-sm border border-gray-200 p-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-[#273e8e] text-2xl font-bold" aria-hidden="true">₦</span>
                                    <h3 className="text-xl font-semibold text-gray-800">
                                        Your Original Choice
                                    </h3>
                                </div>
                                <p className="text-sm text-gray-600 mb-4">
                                    What you selected when you applied
                                    {isPartnerFinancingOrig ? ' (Financing Summary).' : ' (Loan Summary).'}
                                </p>
                                <div className="space-y-3">
                                    {originalRows.map((row, index) => (
                                        <div
                                            key={`orig-${row.label}`}
                                            className="bg-white rounded-lg p-4 border border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                                        >
                                            <p className="text-sm font-medium text-gray-800">{row.label}</p>
                                            <p className={`text-xl font-bold ${
                                                row.accent === 'red'
                                                    ? 'text-red-600'
                                                    : !isPartnerFinancingOrig && index === 4
                                                        ? 'text-[#273e8e]'
                                                        : 'text-gray-800'
                                            }`}>
                                                {row.accent === 'red' ? '−' : ''}{formatCurrency(row.value)}
                                            </p>
                                        </div>
                                    ))}
                                    <div className="border-t border-gray-200 pt-3 mt-1">
                                        <div className="bg-white rounded-lg p-4 border border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                            <p className="text-sm font-medium text-gray-800">Loan Tenor</p>
                                            <p className="text-xl font-bold text-[#273e8e]">
                                                {origTenor > 0
                                                    ? `${origTenor} ${origTenor === 1 ? 'month' : 'months'}`
                                                    : '—'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl shadow-sm border border-green-200 p-6">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="text-[#273e8e] text-2xl font-bold" aria-hidden="true">₦</span>
                                <h3 className="text-xl font-semibold text-gray-800">Partner Financing Offer</h3>
                            </div>
                            <p className="text-sm text-gray-600 mb-4">
                                {(() => {
                                    const customWriteup = String(po.writeup || '').trim();
                                    if (customWriteup) return customWriteup;
                                    const docsSuffix =
                                        (po.documents || []).length > 0
                                            ? ' and check your email for supporting documents.'
                                            : '.';
                                    return `A financing partner has provided an offer for your application. Review the terms below${docsSuffix}`;
                                })()}
                            </p>
                            {order.admin_notes && (
                                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <p className="text-sm text-gray-700">
                                        <strong>Admin Note:</strong> {order.admin_notes}
                                    </p>
                                </div>
                            )}
                            <div className="space-y-3">
                                {offerRows.map((row, index) => (
                                    <div
                                        key={row.label}
                                        className="bg-white rounded-lg p-4 border border-green-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                                    >
                                        <p className="text-sm font-medium text-gray-800">{row.label}</p>
                                        <p className={`text-xl font-bold ${
                                            index === 4 ? 'text-[#273e8e]' : 'text-gray-800'
                                        }`}>
                                            {formatCurrency(row.value)}
                                        </p>
                                    </div>
                                ))}
                                <div className="border-t border-green-200 pt-3 mt-1">
                                    <div className="bg-white rounded-lg p-4 border border-green-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                        <p className="text-sm font-medium text-gray-800">Loan Tenor</p>
                                        <p className="text-xl font-bold text-[#273e8e]">
                                            {tenor > 0 ? `${tenor} ${tenor === 1 ? 'month' : 'months'}` : '—'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            {canPay ? (
                                <div className="mt-4 bg-white rounded-lg p-4 border-2 border-[#273e8e]">
                                    <p className="text-sm text-gray-600 mb-2">
                                        Pay your down payment to proceed with your order.
                                    </p>
                                    <p className="text-xs text-gray-500 mb-3">
                                        After this payment, monthly repayments are handled by the financing partner — not through Troosolar.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => handlePayDownPayment(upfrontDue)}
                                        disabled={processingDownPayment}
                                        className="w-full sm:w-auto px-6 py-3 bg-[#273e8e] text-white font-semibold rounded-lg hover:bg-[#1a2b6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {processingDownPayment ? (
                                            <>Processing...</>
                                        ) : (
                                            <>
                                                <CreditCard size={20} />
                                                Pay Down Payment ({formatCurrency(upfrontDue)})
                                            </>
                                        )}
                                    </button>
                                </div>
                            ) : downPaymentDone ? (
                                <div className="mt-4 rounded-lg p-4 border border-indigo-200 bg-indigo-50">
                                    <p className="text-sm font-semibold text-indigo-900 mb-1">
                                        Partner financing — you&apos;re all set
                                    </p>
                                    <p className="text-sm text-indigo-800">
                                        Thank you for your down payment. Your monthly repayments on the remaining loan balance will be handled by your financing partner
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-600 mt-4">
                                    Our team will follow up with next steps. You can also contact support if you have questions about this offer.
                                </p>
                            )}
                        </div>
                    </div>
                    );
                })()}

                {/* Down payment completed – Troosolar path only here when partner section already shows the partner note */}
                {isApplication && downPaymentDone && !isPartnerFinancingPath && (
                    <div className="bg-green-50 border-green-200 border-2 rounded-xl p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="text-green-600" size={28} />
                                <div>
                                    <h3 className="text-lg font-semibold text-green-800">
                                        Down payment completed
                                    </h3>
                                    <p className="text-sm text-green-700">Your BNPL order has been placed. View your order for repayment schedule and installments.</p>
                                    {order.order_number && (
                                        <p className="text-sm mt-1 text-green-600">
                                            Order #{order.order_number}
                                        </p>
                                    )}
                                </div>
                            </div>
                            {order.order_id && (
                                <button
                                    type="button"
                                    onClick={() => navigate(`/bnpl-loans/${order.order_id}`)}
                                    className="px-6 py-3 bg-[#273e8e] text-white font-semibold rounded-lg hover:bg-[#1a2b6b] transition-colors whitespace-nowrap"
                                >
                                    View order
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Partner financing note after down payment (when partner offer section is not already showing it) */}
                {partnerDownPaymentDone && !showPartnerOfferSection && (
                    <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-6">
                        <div className="flex items-start gap-3">
                            <CheckCircle2 className="text-indigo-600 flex-shrink-0 mt-0.5" size={28} />
                            <div>
                                <h3 className="text-lg font-semibold text-indigo-900 mb-1">
                                    Partner financing — you&apos;re all set
                                </h3>
                                <p className="text-sm text-indigo-800">
                                    Thank you for your down payment. Your monthly repayments on the remaining loan balance will be handled by your financing partner
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Forms section – Download + Upload (approved / fully paid BNPL, application or order view) */}
                {isApprovedOrPaidComplete(displayStatus) && (isApplication && id?.startsWith('app-') || (!isApplication && loanApp)) && (() => {
                    const applicationIdForDownload = isApplication && id?.startsWith('app-') ? id.replace('app-', '') : (loanApp?.id ?? null);
                    const hasGuarantor = loanApp?.guarantor || guarantorIdFromInvite;
                    const refetchAfterAction = () => {
                        if (id?.startsWith('app-')) fetchApplicationDetails(id.replace('app-', ''));
                        else if (id) fetchOrderDetails(id);
                    };
                    return (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-h-0 overflow-visible">
                        <div className="flex items-center gap-3 mb-3">
                            <FileText className="text-[#273e8e] flex-shrink-0" size={24} />
                            <h3 className="text-xl font-semibold text-gray-800">Forms</h3>
                        </div>
                        <p className="text-sm text-gray-600 mb-5">
                            Download the form for your guarantor to sign, then upload the signed copy here. Signed guarantor forms and undated cheques are required before installation. Signed guarantor forms should be uploaded on or before the installation date and undated cheques must be made available on or before the day of installation; installation will not proceed without them.
                        </p>

                        {hasGuarantor && (
                            <div className="bg-green-50 border border-green-200 p-4 rounded-lg flex items-center gap-3 mb-5">
                                <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
                                <p className="text-sm text-green-700">Guarantor is set. Download the form, have it signed, then upload it below.</p>
                            </div>
                        )}

                        {/* 1. Download guarantor form */}
                        <div className={hasGuarantor ? "border-t border-gray-200 pt-5 mt-5" : ""}>
                            <p className="font-semibold text-gray-800 mb-2">Download guarantor form</p>
                            {applicationIdForDownload ? (
                            <button
                                type="button"
                                disabled={downloadingGuarantorForm}
                                onClick={async () => {
                                    const token = localStorage.getItem('access_token');
                                    if (!token) { alert('Please login to download'); return; }
                                    setDownloadingGuarantorForm(true);
                                    const triggerPdfDownload = (blob, filename = 'Troosolar-Guarantor-Form.pdf') => {
                                        const url = window.URL.createObjectURL(blob);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.setAttribute('download', filename);
                                        document.body.appendChild(link);
                                        link.click();
                                        link.remove();
                                        window.URL.revokeObjectURL(url);
                                    };
                                    const MIN_PDF_SIZE = 2000; // reject tiny/empty placeholder PDFs (real form is usually tens of KB+)
                                    const isPdfBlob = async (blob, contentType = '') => {
                                        if (!blob || blob.size < 10) return false;
                                        if (blob.size < MIN_PDF_SIZE) return false;
                                        if (contentType && contentType.toLowerCase().includes('application/pdf')) return true;
                                        const buf = await blob.slice(0, 5).arrayBuffer();
                                        const bytes = new Uint8Array(buf);
                                        return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
                                    };
                                    const tryFetchPdf = async (url) => {
                                        const res = await fetch(url, { method: 'GET' });
                                        if (!res.ok) return null;
                                        const blob = await res.blob();
                                        const ct = res.headers.get('content-type') || '';
                                        if (!blob || blob.size < MIN_PDF_SIZE || !(await isPdfBlob(blob, ct))) return null;
                                        return new Blob([await blob.arrayBuffer()], { type: 'application/pdf' });
                                    };
                                    const origin = window.location.origin;
                                    const docsPaths = import.meta.env.VITE_GUARANTOR_FORM_FALLBACK_PATH
                                        ? [import.meta.env.VITE_GUARANTOR_FORM_FALLBACK_PATH]
                                        : ['/docs/Guarantor%20Form.pdf', '/docs/Guarantor%20Form%20.pdf'];
                                    const docsUrls = docsPaths.map((p) => (p.startsWith('http') ? p : origin + p));
                                    let downloaded = false;
                                    for (const docsUrl of docsUrls) {
                                        try {
                                            const pdfBlob = await tryFetchPdf(docsUrl);
                                            if (pdfBlob) {
                                                triggerPdfDownload(pdfBlob, 'Troosolar-Guarantor-Form.pdf');
                                                downloaded = true;
                                                break;
                                            }
                                        } catch (e) {
                                            console.warn('Dashboard docs guarantor form fetch failed:', e);
                                        }
                                    }
                                    if (!downloaded) {
                                        try {
                                            const response = await axios.get(
                                                `${API.BNPL_GUARANTOR_FORM}?loan_application_id=${applicationIdForDownload}`,
                                                { headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' }, responseType: 'blob' }
                                            );
                                            const blob = response.data;
                                            const contentType = (response.headers && response.headers['content-type']) || '';
                                            if (blob && blob.size >= MIN_PDF_SIZE && !contentType.includes('application/json') && (await isPdfBlob(blob, contentType))) {
                                                triggerPdfDownload(new Blob([blob], { type: 'application/pdf' }), `Troosolar-Guarantor-Form-${applicationIdForDownload}.pdf`);
                                                downloaded = true;
                                            }
                                        } catch (error) {
                                            console.error('Download guarantor form error:', error);
                                        }
                                    }
                                    if (!downloaded) {
                                        const fallbackUrl = docsUrls[0];
                                        window.open(fallbackUrl, '_blank');
                                        alert('Guarantor form could not be downloaded. Add the real PDF (not empty) at: TrooSolar - Dashboard/public/docs/ — name it either "Guarantor Form.pdf" or "Guarantor Form .pdf"');
                                    }
                                    setDownloadingGuarantorForm(false);
                                }}
                                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#273e8e] text-white font-semibold rounded-lg hover:bg-[#1a2b6b] disabled:opacity-50 transition-colors"
                            >
                                <Download size={20} />
                                {downloadingGuarantorForm ? 'Downloading...' : 'Download Guarantor Form'}
                            </button>
                            ) : (
                                <p className="text-sm text-gray-500">Application link not available for download. View this loan from My BNPL Loans to download the form.</p>
                            )}
                        </div>

                        {/* 2. Upload signed form – always visible */}
                        <div className="border-t border-gray-200 pt-5 mt-5">
                            <p className="font-semibold text-gray-800 mb-2">Upload signed form</p>
                            {(loanApp?.guarantor?.has_signed_form || loanApp?.guarantor?.signed_form_path) && (
                                <div className="bg-green-50 border border-green-200 p-4 rounded-lg flex items-center gap-3 mb-4">
                                    <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
                                    <p className="text-sm text-green-700">Signed guarantor form has been uploaded. You can upload a new file to replace it.</p>
                                </div>
                            )}
                            <p className="text-sm text-gray-500 mb-3">Upload the form after your guarantor has signed it (PDF or image). You can upload on or before the installation date. The latest upload replaces any previous one.</p>
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#273e8e] transition-colors cursor-pointer relative">
                                <input
                                    type="file"
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        const token = localStorage.getItem('access_token');
                                        if (!token) { alert('Please login'); return; }
                                        const guarantorId = loanApp?.guarantor?.id ?? guarantorIdFromInvite;
                                        if (!guarantorId && !applicationIdForDownload) {
                                            alert('Unable to identify the guarantor. Please try again from your BNPL Loans page.');
                                            return;
                                        }
                                        setUploadingGuarantorForm(true);
                                        try {
                                            const fd = new FormData();
                                            if (guarantorId) fd.append('guarantor_id', String(guarantorId));
                                            if (applicationIdForDownload) fd.append('loan_application_id', String(applicationIdForDownload));
                                            fd.append('signed_form', file);
                                            const res = await axios.post(API.BNPL_GUARANTOR_UPLOAD, fd, {
                                                headers: { Authorization: `Bearer ${token}` },
                                            });
                                            if (res.data?.status === 'success') {
                                                alert('Signed form uploaded successfully.');
                                                refetchAfterAction();
                                            } else {
                                                alert(res.data?.message || 'Upload failed.');
                                            }
                                        } catch (err) {
                                            console.error('Guarantor upload error:', err);
                                            alert(err.response?.data?.message || 'Failed to upload form.');
                                        } finally {
                                            setUploadingGuarantorForm(false);
                                        }
                                        e.target.value = '';
                                    }}
                                />
                                {uploadingGuarantorForm ? (
                                    <Loader className="animate-spin mx-auto text-[#273e8e]" size={24} />
                                ) : (
                                    <>
                                        <Upload className="mx-auto text-gray-400 mb-2" size={24} />
                                        <p className="text-sm text-gray-500">Click to upload signed guarantor form (PDF or image)</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    );
                })()}

                {/* Book Installation Date – after down payment, order view only */}
                {!isApplication && loanApp && isApprovedOrPaidComplete(displayStatus) && (order.payment_status === 'paid' || order.down_payment_completed) && (() => {
                    const instDate = loanApp.installation_requested_date;
                    const instStatus = loanApp.installation_booking_status;
                    const rejectedDates = loanApp.installation_rejected_dates || [];
                    const suggestedDate = loanApp.installation_admin_proposed_date;
                    const rejectionNote = loanApp.installation_rejection_note;
                    const acceptSuggestedDate = async () => {
                        if (!suggestedDate || !order?.id) return;
                        setProcessingBookInstallation(true);
                        try {
                            const token = localStorage.getItem('access_token');
                            const res = await axios.post(API.BNPL_INSTALLATION_BOOK, {
                                order_id: order.id,
                                requested_date: suggestedDate,
                            }, { headers: { Authorization: `Bearer ${token}` } });
                            if (res.data?.status === 'success') {
                                if (id) fetchOrderDetails(id);
                                alert(res.data?.message || 'Installation date confirmed.');
                            } else {
                                alert(res.data?.message || 'Failed to accept suggested date.');
                            }
                        } catch (err) {
                            alert(err.response?.data?.message || 'Failed to accept suggested date.');
                        } finally {
                            setProcessingBookInstallation(false);
                        }
                    };
                    return (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                            <div className="flex items-center gap-3 mb-3">
                                <Calendar className="text-[#273e8e]" size={24} />
                                <h3 className="text-xl font-semibold text-gray-800">Book Installation Date</h3>
                            </div>
                            {instStatus === 'accepted' && instDate && (
                                <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                                    <p className="text-green-800 font-medium">Installation date confirmed: {instDate}</p>
                                </div>
                            )}
                            {instStatus === 'pending' && instDate && (
                                <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-4">
                                    <p className="text-amber-800">Your requested date <strong>{instDate}</strong> is pending confirmation. We will notify you once it is confirmed.</p>
                                </div>
                            )}
                            {(!instDate || instStatus === 'rejected') && (
                                <div className="mb-4">
                                    {instStatus === 'rejected' && (
                                        <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-4 space-y-2">
                                            <p className="text-red-800">Your requested date could not be confirmed. Please choose another date below (Sundays and previously rejected dates are not available).</p>
                                            {suggestedDate && (
                                                <p className="text-red-900 font-medium">Suggested date from Troosolar: {suggestedDate}</p>
                                            )}
                                            {rejectionNote && (
                                                <p className="text-red-800 text-sm"><strong>Note:</strong> {rejectionNote}</p>
                                            )}
                                            {suggestedDate && (
                                                <button
                                                    type="button"
                                                    disabled={processingBookInstallation}
                                                    onClick={acceptSuggestedDate}
                                                    className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#273e8e] text-white font-semibold rounded-lg hover:bg-[#1a2b6b] disabled:opacity-50"
                                                >
                                                    {processingBookInstallation ? 'Confirming…' : `Accept suggested date (${suggestedDate})`}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    {!instDate && instStatus !== 'rejected' && (
                                        <p className="text-sm text-gray-500 mb-4">Choose a date at least 72 hours from today. Sundays are not available.</p>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowBookInstallationModal(true);
                                            setBookingInstallationDate(suggestedDate || '');
                                        }}
                                        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#273e8e] text-white font-semibold rounded-lg hover:bg-[#1a2b6b] disabled:opacity-50 transition-colors"
                                    >
                                        <Calendar size={20} />
                                        {instStatus === 'rejected' ? 'Book another date' : 'Book Installation Date'}
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Book Installation Date modal */}
                {showBookInstallationModal && !isApplication && orderData && !orderData.isList && (() => {
                    const order = orderData;
                    const loanAppModal = order.loan_application;
                    const rejectedDates = loanAppModal?.installation_rejected_dates || [];
                    const minDate = (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); })();
                    const isSunday = (dateStr) => new Date(dateStr).getDay() === 0;
                    const handleBookSubmit = async () => {
                        if (!bookingInstallationDate) { alert('Please select a date.'); return; }
                        if (isSunday(bookingInstallationDate)) { alert('Sundays are not available. Please choose another day.'); return; }
                        if (rejectedDates.includes(bookingInstallationDate)) { alert('This date was previously rejected. Please choose another date.'); return; }
                        const minD = new Date(); minD.setDate(minD.getDate() + 3);
                        if (new Date(bookingInstallationDate) < minD) { alert('Date must be at least 72 hours from today.'); return; }
                        setProcessingBookInstallation(true);
                        try {
                            const token = localStorage.getItem('access_token');
                            const res = await axios.post(API.BNPL_INSTALLATION_BOOK, {
                                order_id: order.id,
                                requested_date: bookingInstallationDate,
                            }, { headers: { Authorization: `Bearer ${token}` } });
                            if (res.data?.status === 'success') {
                                setShowBookInstallationModal(false);
                                setBookingInstallationDate('');
                                if (id) fetchOrderDetails(id);
                                alert('Installation date request submitted. You will be notified once it is confirmed.');
                            } else {
                                alert(res.data?.message || 'Failed to submit.');
                            }
                        } catch (err) {
                            alert(err.response?.data?.message || 'Failed to book installation date.');
                        } finally {
                            setProcessingBookInstallation(false);
                        }
                    };
                    return (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !processingBookInstallation && setShowBookInstallationModal(false)}>
                            <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Book Installation Date</h3>
                                <p className="text-sm text-gray-500 mb-3">Select a date at least 72 hours from today. Sundays are not available. Previously rejected dates cannot be selected.</p>
                                <input
                                    type="date"
                                    min={minDate}
                                    value={bookingInstallationDate}
                                    onChange={e => setBookingInstallationDate(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4"
                                />
                                <div className="flex gap-3">
                                    <button type="button" onClick={() => { setShowBookInstallationModal(false); setBookingInstallationDate(''); }} className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium">Cancel</button>
                                    <button type="button" onClick={handleBookSubmit} disabled={processingBookInstallation} className="flex-1 py-2 bg-[#273e8e] text-white rounded-lg font-medium disabled:opacity-50">{processingBookInstallation ? 'Submitting...' : 'Submit'}</button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Repayment Summary — Troosolar path only (partner financing ends after down payment) */}
                {!isPartnerFinancingPath && isApprovedOrPaidComplete(displayStatus) && repaymentSummary && Object.keys(repaymentSummary).length > 0 && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-sm border border-blue-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <TrendingUp className="text-[#273e8e]" size={24} />
                            <h3 className="text-xl font-semibold text-gray-800">Repayment Summary</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white rounded-lg p-4 border border-blue-100">
                                <p className="text-sm text-gray-500 mb-1">Total Repayment Amount</p>
                                <p className="text-xl font-bold text-gray-800">
                                    {formatCurrency(repaymentSummary.total_amount || repaymentSummary.total || 0)}
                                </p>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-blue-100">
                                <p className="text-sm text-gray-500 mb-1">Amount Paid</p>
                                <p className="text-xl font-bold text-green-600">
                                    {formatCurrency(repaymentSummary.paid_amount || repaymentSummary.paid || 0)}
                                </p>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-blue-100">
                                <p className="text-sm text-gray-500 mb-1">Pending Amount</p>
                                <p className="text-xl font-bold text-yellow-600">
                                    {formatCurrency(repaymentSummary.pending_amount || repaymentSummary.pending || 0)}
                                </p>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-blue-100">
                                <p className="text-sm text-gray-500 mb-1">Overdue Amount</p>
                                <p className="text-xl font-bold text-red-600">
                                    {formatCurrency(repaymentSummary.overdue_amount || repaymentSummary.overdue || 0)}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Loan Calculation / Repayment Breakdown — mirror BNPL flow summary */}
                {/* Hidden when Partner/Counter sections already show Original Choice (avoids duplicate). */}
                {(loanCalc || ld) && !showPartnerOfferSection && !showCounterOfferHistorySection && (() => {
                    const toNum = (v) => {
                        if (v === null || v === undefined || v === '') return null;
                        const n = parseAmount(v);
                        return Number.isFinite(n) ? n : null;
                    };
                    const pickNum = (...vals) => {
                        for (const v of vals) {
                            const n = toNum(v);
                            if (n !== null) return n;
                        }
                        return 0;
                    };
                    const parseInterestRate = (v) => {
                        if (v === null || v === undefined || v === '') return null;
                        const n = parseFloat(String(v).replace(/,/g, ''));
                        return Number.isFinite(n) ? n : null;
                    };

                    // Prefer snapshot / loan_details from apply flow (original customer choice).
                    // Counter-offer terms are shown in the Counter Offer section, not merged here.
                    const statusLower = String(displayStatus || '').toLowerCase();
                    const insurancePct = pickNum(ld?.insurancePct, ld?.insurance_fee_percentage, ld?.feePercentages?.insurance) || 3;
                    const managementPct = pickNum(ld?.managementPct, ld?.management_fee_percentage, ld?.feePercentages?.management) || 1;
                    const legalPct = pickNum(ld?.legalPct, ld?.legal_fee_percentage, ld?.feePercentages?.legal) || 1;
                    const totalAmount = pickNum(
                        ld?.totalAmount,
                        ld?.total_amount,
                        loanCalc?.total_amount
                    );
                    const adminFeesTotal = pickNum(
                        ld?.adminFeesTotal,
                        (pickNum(ld?.insuranceFee, 0) + pickNum(ld?.managementFee, 0) + pickNum(ld?.legalFee, 0))
                    );
                    const initialDepositWithFees = pickNum(
                        ld?.depositAmount,
                        ld?.down_payment,
                        loanCalc?.down_payment
                    );
                    // Bundle price (before admin fees) — used to derive deposit % when not stored
                    const baseDepositFromSnap = pickNum(ld?.baseDepositAmount);
                    const bundlePriceApprox =
                        pickNum(ld?.principal, ld?.totalLoanAmount) > 0 && baseDepositFromSnap >= 0
                            ? Math.max(pickNum(ld?.principal, ld?.totalLoanAmount) + baseDepositFromSnap, 0)
                            : totalAmount > 0 && adminFeesTotal >= 0
                                ? Math.max(totalAmount - adminFeesTotal, 0)
                                : 0;
                    let explicitLoanAmount = pickNum(
                        ld?.totalLoanAmount,
                        ld?.principal,
                        ld?.loan_amount,
                        loanCalc?.principal_amount
                    );
                    const monoLoanAmt = pickNum(loanCalc?.loan_amount);
                    const monoTotalAmt = pickNum(loanCalc?.total_amount);
                    const monoPrincipalAmt = pickNum(loanCalc?.principal_amount);
                    if (explicitLoanAmount <= 0 && monoPrincipalAmt > 0) {
                        explicitLoanAmount = monoPrincipalAmt;
                    } else if (explicitLoanAmount <= 0 && monoLoanAmt > 0) {
                        const looksLikeDuplicatePrincipal =
                            monoTotalAmt > 0 && Math.abs(monoLoanAmt - monoTotalAmt) < 1;
                        const looksLikeTotalRepayment =
                            pickNum(ld?.totalRepaymentAmount, ld?.totalRepayment) > 0 &&
                            Math.abs(monoLoanAmt - pickNum(ld?.totalRepaymentAmount, ld?.totalRepayment)) < 1;
                        if (!looksLikeDuplicatePrincipal && !looksLikeTotalRepayment) {
                            explicitLoanAmount = monoLoanAmt;
                        }
                    }
                    let totalLoanAmount =
                        explicitLoanAmount > 0
                            ? explicitLoanAmount
                            : Math.max(totalAmount - initialDepositWithFees, 0);
                    const depositPercentRaw = pickNum(
                        ld?.depositPercent,
                        ld?.deposit_percent,
                        loanCalc?.deposit_percent,
                        loanCalc?.depositPercent
                    );
                    let depositPercentForLabel = depositPercentRaw;
                    if (!depositPercentForLabel || depositPercentForLabel <= 0) {
                        const baseDep = pickNum(ld?.baseDepositAmount);
                        if (baseDep > 0 && bundlePriceApprox > 0) {
                            depositPercentForLabel = Math.round((baseDep / bundlePriceApprox) * 100);
                        } else if (initialDepositWithFees > 0 && bundlePriceApprox > 0) {
                            const baseOnly = Math.max(initialDepositWithFees - adminFeesTotal, 0);
                            if (baseOnly > 0) {
                                depositPercentForLabel = Math.round((baseOnly / bundlePriceApprox) * 100);
                            }
                        }
                    }
                    if (!depositPercentForLabel || depositPercentForLabel <= 0) {
                        const equity = pickNum(ld?.baseDepositAmount) || Math.max(initialDepositWithFees - adminFeesTotal, 0);
                        if (equity > 0 && totalLoanAmount > 0) {
                            depositPercentForLabel = Math.round((equity / (equity + totalLoanAmount)) * 100);
                        }
                    }
                    const interestRatePercent =
                        parseInterestRate(ld?.interestRate) ??
                        parseInterestRate(ld?.interest_rate) ??
                        parseInterestRate(loanCalc?.interest_rate) ??
                        DEFAULT_BNPL_INTEREST_RATE_PERCENT;
                    // Prefer application / snapshot tenor — mono row can be wrong (e.g. default 12)
                    const tenor = Number(
                        ld?.tenor ??
                            ld?.repayment_duration ??
                            loanApp?.repayment_duration ??
                            loanCalc?.repayment_duration ??
                            loanCalc?.tenor ??
                            12
                    ) || 12;
                    const totalInterestFromApi = pickNum(
                        ld?.totalInterestAmount,
                        ld?.totalInterest,
                        loanCalc?.total_interest_amount
                    );
                    let totalInterestAmount =
                        totalInterestFromApi > 0
                            ? totalInterestFromApi
                            : (interestRatePercent / 100) * totalLoanAmount * tenor;
                    let totalRepaymentAmount = pickNum(
                        ld?.totalRepaymentAmount,
                        ld?.totalRepayment,
                        loanCalc?.total_repayment
                    ) || (totalLoanAmount + totalInterestAmount);
                    let monthlyRepaymentAmount = pickNum(
                        ld?.monthlyRepaymentAmount,
                        ld?.monthlyRepayment,
                        loanCalc?.monthly_repayment,
                        loanCalc?.monthly_payment
                    ) || (tenor > 0 ? totalRepaymentAmount / tenor : 0);

                    const depositLabelPct =
                        depositPercentForLabel > 0 ? `${depositPercentForLabel}%` : null;

                    // Partner path uses the first/simple calculator (deposit + tenor only) — not Troosolar full breakdown.
                    const snapFinancingPath = String(
                        order?.financing_path
                            || loanApp?.financing_path
                            || order?.loan_plan_snapshot?.financing?.path
                            || loanApp?.loan_plan_snapshot?.financing?.path
                            || ''
                    ).toLowerCase();
                    const isPartnerFinancing =
                        snapFinancingPath === 'partner'
                        || String(order?.credit_check_method || loanApp?.credit_check_method || '').toLowerCase() === 'partner';

                    const partnerTotalAmount = pickNum(
                        ld?.totalAmount,
                        ld?.grandTotal,
                        ld?.invoiceGrandTotal,
                        loanCalc?.total_amount
                    );
                    const partnerInitialDeposit = pickNum(
                        ld?.baseDepositAmount,
                        ld?.depositAmount,
                        ld?.down_payment,
                        loanCalc?.down_payment
                    );
                    const partnerLoanAmount = pickNum(
                        ld?.totalLoanAmount,
                        ld?.principal,
                        loanCalc?.principal_amount
                    ) || Math.max(partnerTotalAmount - partnerInitialDeposit, 0);
                    const partnerDepositLabelPct =
                        depositPercentRaw > 0
                            ? `${depositPercentRaw}%`
                            : (depositPercentForLabel > 0 ? `${depositPercentForLabel}%` : null);

                    const summaryRows = isPartnerFinancing
                        ? [
                            { label: 'Total Amount', value: partnerTotalAmount },
                            {
                                label: partnerDepositLabelPct
                                    ? `Initial Deposit (${partnerDepositLabelPct})`
                                    : 'Initial Deposit',
                                value: partnerInitialDeposit,
                                accent: 'red',
                            },
                            { label: 'Total Loan Amount', value: partnerLoanAmount },
                        ]
                        : [
                            {
                                label: depositLabelPct
                                    ? `Initial Deposit (${depositLabelPct}) + Total Administrative Fees`
                                    : 'Initial Deposit + Total Administrative Fees',
                                value: initialDepositWithFees,
                            },
                            { label: 'Total Loan Amount', value: totalLoanAmount },
                            { label: `Total Interest Amount (${interestRatePercent}% × ${tenor} mo)`, value: totalInterestAmount },
                            { label: 'Total Repayment Amount', value: totalRepaymentAmount },
                            { label: 'Monthly Repayment Amount', value: monthlyRepaymentAmount },
                        ];
                    const loanSummaryTitle = isCounterOfferPending
                        ? 'Your Original Choice'
                        : isPartnerFinancing
                            ? 'Financing Summary'
                            : 'Loan Summary';
                    return (
                    <div className={`rounded-xl shadow-sm border p-6 ${
                        isCounterOfferPending
                            ? 'bg-gradient-to-r from-slate-50 to-gray-50 border-gray-200'
                            : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
                    }`}>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-[#273e8e] text-2xl font-bold" aria-hidden="true">₦</span>
                            <h3 className="text-xl font-semibold text-gray-800">
                                {loanSummaryTitle}
                            </h3>
                        </div>
                        {isCounterOfferPending && (
                            <p className="text-sm text-gray-600 mb-4">
                                What you selected when you applied (Loan Summary).
                            </p>
                        )}
                        <div className="space-y-3">
                            {summaryRows.map((row, index) => (
                                <div key={row.label} className={`bg-white rounded-lg p-4 border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 ${
                                    isCounterOfferPending ? 'border-gray-100' : 'border-green-100'
                                }`}>
                                    <p className="text-sm font-medium text-gray-800">{row.label}</p>
                                    <p className={`text-xl font-bold ${
                                        row.accent === 'red'
                                            ? 'text-red-600'
                                            : !isPartnerFinancing && index === 4
                                                ? 'text-[#273e8e]'
                                                : 'text-gray-800'
                                    }`}>
                                        {row.accent === 'red' ? '−' : ''}{formatCurrency(row.value)}
                                    </p>
                                </div>
                            ))}
                            <div className={`border-t pt-3 mt-1 ${isCounterOfferPending ? 'border-gray-200' : 'border-green-200'}`}>
                                <div className={`bg-white rounded-lg p-4 border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 ${
                                    isCounterOfferPending ? 'border-gray-100' : 'border-green-100'
                                }`}>
                                    <p className="text-sm font-medium text-gray-800">Loan Tenor</p>
                                    <p className="text-xl font-bold text-[#273e8e]">
                                        {tenor} {tenor === 1 ? 'month' : 'months'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        {/* Pay Down Payment – Troosolar path only; partner financers settle outside this breakdown */}
                        {!isPartnerFinancing &&
                            !hasCounterOfferTerms &&
                            isApplication &&
                            (displayStatus?.toLowerCase() === 'approved' || displayStatus?.toLowerCase() === 'counter_offer_accepted') &&
                            !downPaymentDone &&
                            (loanCalc?.down_payment || ld?.depositAmount) &&
                            parseAmount(repaymentSummary?.paid_amount ?? 0) <
                                parseAmount(loanCalc?.down_payment ?? ld?.depositAmount) && (
                            <div className="mt-4 bg-white rounded-lg p-4 border-2 border-[#273e8e]">
                                <p className="text-sm text-gray-600 mb-2">
                                    Pay your down payment to proceed with your order.
                                </p>
                                <button
                                    type="button"
                                    onClick={handlePayDownPayment}
                                    disabled={processingDownPayment}
                                    className="w-full sm:w-auto px-6 py-3 bg-[#273e8e] text-white font-semibold rounded-lg hover:bg-[#1a2b6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {processingDownPayment ? (
                                        <>Processing...</>
                                    ) : (
                                        <>
                                            <CreditCard size={20} />
                                            Pay Down Payment ({formatCurrency(loanCalc?.down_payment ?? ld?.depositAmount)})
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                    );
                })()}

                {/* Overdue Warning Banner — only after down payment / on real orders */}
                {showRepaymentUi && installmentsWithHistory?.hasOverdue && (
                    <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-6">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="text-red-600" size={24} />
                            <div className="flex-1">
                                <h3 className="font-semibold text-red-800 mb-1">
                                    Overdue Payments Detected
                                </h3>
                                <p className="text-sm text-red-700">
                                    You have {installmentsWithHistory.overdueCount || 0} overdue installment(s) totaling {formatCurrency(installmentsWithHistory.overdueAmount || 0)}. Please pay immediately to avoid penalties.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Repayment Summary Cards */}
                {showRepaymentUi && repaymentSchedule && repaymentSchedule.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <p className="text-sm text-gray-500 mb-1">Total Installments</p>
                            <p className="text-2xl font-bold text-gray-800">
                                {repaymentSchedule.length}
                            </p>
                        </div>
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <p className="text-sm text-gray-500 mb-1">Paid</p>
                            <p className="text-2xl font-bold text-green-600">
                                {repaymentSchedule.filter(inst => inst.status === 'paid' || inst.computed_status === 'paid').length}
                            </p>
                        </div>
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <p className="text-sm text-gray-500 mb-1">Pending</p>
                            <p className="text-2xl font-bold text-yellow-600">
                                {repaymentSchedule.filter(inst => inst.status !== 'paid' && inst.computed_status !== 'paid').length}
                            </p>
                        </div>
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <p className="text-sm text-gray-500 mb-1">Overdue</p>
                            <p className="text-2xl font-bold text-red-600">
                                {repaymentSchedule.filter(inst => {
                                    const dueDate = new Date(inst.due_date || inst.payment_date);
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    dueDate.setHours(0, 0, 0, 0);
                                    return dueDate < today && inst.status !== 'paid' && inst.computed_status !== 'paid';
                                }).length}
                            </p>
                        </div>
                    </div>
                )}

                {/* Current Month Installments */}
                {showRepaymentUi && installmentsWithHistory?.current_month && installmentsWithHistory.current_month.length > 0 && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-sm border border-blue-200 p-6 mb-6">
                        <div className="flex items-center gap-3 mb-4">
                            <Clock className="text-[#273e8e]" size={24} />
                            <h3 className="text-xl font-semibold text-gray-800">Current Month Installments</h3>
                        </div>
                        <div className="space-y-3">
                            {installmentsWithHistory.current_month.map((installment, index) => {
                                const isOverdue = installment.is_overdue || (new Date(installment.payment_date || installment.due_date) < new Date() && installment.status !== 'paid');
                                return (
                                    <div
                                        key={installment.id || index}
                                        className={`bg-white rounded-lg p-4 border-2 ${
                                            isOverdue ? 'border-red-300 bg-red-50' : 'border-blue-100'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="text-sm font-semibold text-gray-700">
                                                        Installment #{installment.installment_number ?? installment.sequence ?? installment.id ?? index + 1}
                                                    </span>
                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(installment.status || installment.computed_status)}`}>
                                                        {(installment.status || installment.computed_status)?.toUpperCase() || 'PENDING'}
                                                    </span>
                                                    {isOverdue && (
                                                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
                                                            OVERDUE
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-600">
                                                    Due: {formatDate(installment.payment_date || installment.due_date)}
                                                </p>
                                                {installment.remaining_duration && (
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        {installment.remaining_duration} installments remaining
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-bold text-[#273e8e] mb-2">
                                                    {formatCurrency(installment.amount)}
                                                </p>
                                                {installment.status !== 'paid' && installment.computed_status !== 'paid' && (
                                                    <button
                                                        onClick={() => {
                                                            const dueRaw = getInstallmentDueDate(installment);
                                                            const num = getInstallmentNumber(installment, index);
                                                            setSelectedInstallment({
                                                                ...installment,
                                                                installment_number:
                                                                    installment.installment_number ?? num,
                                                                display_number: num,
                                                                due_date: dueRaw,
                                                                payment_date:
                                                                    installment.payment_date || dueRaw,
                                                            });
                                                            setShowPaymentModal(true);
                                                        }}
                                                        className="px-4 py-2 bg-[#273e8e] text-white text-sm font-semibold rounded-lg hover:bg-[#1a2b6b] transition-colors"
                                                    >
                                                        Pay Now
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Mono Direct Debit — automatic repayments */}
                {(() => {
                    const monoCalculationId = order.mono_calculation_id
                        || loanApp?.mono_loan_calculation
                        || loanApp?.mono?.id;
                    const mandate = order.mono_debit_mandate;
                    if (!monoCalculationId) {
                        return null;
                    }
                    const ready = mandate?.ready_to_debit;
                    const pending = mandate?.has_mandate && !ready;
                    return (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
                            <div className="flex items-start gap-3 mb-3">
                                <Building className="text-[#273e8e] shrink-0 mt-0.5" size={22} />
                                <div className="flex-1">
                                    <h3 className="text-lg font-semibold text-gray-800">Automatic bank repayments (Mono Direct Debit)</h3>
                                    <p className="text-sm text-gray-600 mt-1">
                                        Authorize a Direct Debit mandate so monthly installments can be collected from your linked bank account.
                                        You can still pay manually with card or bank transfer anytime.
                                    </p>
                                </div>
                            </div>
                            {ready ? (
                                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                                    Your repayment mandate is active. Choose <strong>Debit from linked bank</strong> when paying an installment, or wait for automatic collection on due dates.
                                </div>
                            ) : pending ? (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-3">
                                    <p>
                                        Mandate status: <strong>{mandate.status || 'pending'}</strong>.
                                        {mandate.authorization_url
                                            ? ' If you have not finished authorization, open Mono again.'
                                            : ' Waiting for bank approval (can take up to 72 hours).'}
                                    </p>
                                    {mandate.authorization_url && (
                                        <button
                                            type="button"
                                            onClick={() => window.open(mandate.authorization_url, '_blank', 'noopener,noreferrer')}
                                            className="text-[#273e8e] font-semibold underline"
                                        >
                                            Open Mono authorization
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    disabled={processingMandateSetup}
                                    onClick={() => handleSetupMonoMandate(monoCalculationId, loanApp?.id)}
                                    className="w-full sm:w-auto px-6 py-3 bg-[#273e8e] text-white font-semibold rounded-lg hover:bg-[#1a2b6b] disabled:opacity-50"
                                >
                                    {processingMandateSetup ? 'Starting...' : 'Set up automatic repayments'}
                                </button>
                            )}
                        </div>
                    );
                })()}

                {/* Repayment Calendar */}
                {showRepaymentUi && repaymentSchedule && repaymentSchedule.length > 0 && (
                    <RepaymentCalendar
                        installments={repaymentSchedule}
                        onInstallmentClick={(installment) => {
                            if (installment.status !== 'paid') {
                                setSelectedInstallment(installment);
                                setShowPaymentModal(true);
                            }
                        }}
                    />
                )}

                {/* Repayment Schedule Table */}
                {showRepaymentUi && repaymentSchedule && repaymentSchedule.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
                        <div className="flex items-center gap-3 mb-4">
                            <Calendar className="text-[#273e8e]" size={20} />
                            <h3 className="text-lg font-semibold text-gray-800">Repayment Schedule</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Installment #</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment Date</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {repaymentSchedule.map((installment, index) => {
                                        const dueRaw = getInstallmentDueDate(installment);
                                        const dueObj = dueRaw ? new Date(dueRaw) : null;
                                        const dueValid = dueObj && !Number.isNaN(dueObj.getTime());
                                        const installmentNo = getInstallmentNumber(installment, index);
                                        const isOverdue =
                                            installment.is_overdue ||
                                            (dueValid &&
                                                dueObj < new Date() &&
                                                installment.status !== 'paid');
                                        const canPay = installment.status !== 'paid' && installment.id;
                                        return (
                                            <tr key={installment.id || index} className={isOverdue ? 'bg-red-50' : ''}>
                                                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                                    {installmentNo}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-700">
                                                    {formatDate(dueRaw)}
                                                </td>
                                                <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                                                    {formatCurrency(installment.amount)}
                                                </td>
                                                <td className="px-4 py-3 text-sm">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusBadge(installment.status)}`}>
                                                        {installment.status?.toUpperCase() || 'PENDING'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-700">
                                                    {(() => {
                                                        const paidRaw = getInstallmentPaidAt(installment);
                                                        // Never use payment_date here — that is the scheduled due date.
                                                        return paidRaw ? formatDate(paidRaw) : '—';
                                                    })()}
                                                </td>
                                                <td className="px-4 py-3 text-sm">
                                                    {canPay ? (
                                                        <button
                                                            onClick={() => {
                                                                setSelectedInstallment({
                                                                    ...installment,
                                                                    installment_number:
                                                                        installment.installment_number ??
                                                                        installmentNo,
                                                                    display_number: installmentNo,
                                                                    due_date: dueRaw,
                                                                    payment_date:
                                                                        installment.payment_date || dueRaw,
                                                                });
                                                                setShowPaymentModal(true);
                                                            }}
                                                            className="px-3 py-1.5 bg-[#273e8e] text-white text-xs font-semibold rounded-lg hover:bg-[#1a2b6b] transition-colors"
                                                        >
                                                            Pay Now
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Repayment History */}
                {repaymentHistory && repaymentHistory.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <Receipt className="text-[#273e8e]" size={20} />
                            <h3 className="text-lg font-semibold text-gray-800">Repayment History</h3>
                        </div>
                        <div className="space-y-4">
                            {repaymentHistory.map((payment, index) => (
                                <div key={payment.id || index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                                    <div className="flex items-center gap-4">
                                        <CheckCircle2 className="text-green-600" size={20} />
                                        <div>
                                            <p className="font-semibold text-gray-800">
                                                {formatCurrency(payment.amount)}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                Paid on {formatDate(payment.payment_date || payment.created_at)}
                                            </p>
                                            {payment.reference && (
                                                <p className="text-xs text-gray-400">
                                                    Reference: {payment.reference}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(payment.status || 'paid')}`}>
                                        {payment.status?.toUpperCase() || 'PAID'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Loan Application Details */}
                {loanApp && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <FileText className="text-[#273e8e]" size={20} />
                                <h3 className="text-lg font-semibold text-gray-800">Application Details</h3>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">Application ID</p>
                                    <p className="font-semibold text-gray-800">#{loanApp.id}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">Total repayment amount</p>
                                    <p className="font-semibold text-gray-800">
                                        {displayTotalRepaymentForDetails != null
                                            ? formatCurrency(displayTotalRepaymentForDetails)
                                            : 'N/A'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">Repayment Duration</p>
                                    <p className="font-semibold text-gray-800">
                                        {displayRepaymentDuration || 'N/A'} months
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">Credit Check Method</p>
                                    <p className="font-semibold text-gray-800 capitalize">
                                        {displayCreditCheckMethod || 'N/A'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">Customer Type</p>
                                    <p className="font-semibold text-gray-800 capitalize">
                                        {displayCustomerType || 'N/A'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">Status</p>
                                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(displayStatus || loanApp.status)}`}>
                                        {(displayStatus || loanApp.status)?.toUpperCase().replace(/_/g, ' ') || 'PENDING'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Property Information */}
                        {(loanApp.property_address || loanApp.property_state) && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <Home className="text-[#273e8e]" size={20} />
                                    <h3 className="text-lg font-semibold text-gray-800">Property Information</h3>
                                </div>
                                <div className="space-y-4">
                                    {loanApp.property_state && (
                                        <div>
                                            <p className="text-sm text-gray-500 mb-1">State</p>
                                            <p className="font-semibold text-gray-800">
                                                {loanApp.property_state}
                                            </p>
                                        </div>
                                    )}
                                    {loanApp.property_address && (
                                        <div>
                                            <p className="text-sm text-gray-500 mb-1">Address</p>
                                            <p className="font-semibold text-gray-800">
                                                {loanApp.property_address}
                                            </p>
                                        </div>
                                    )}
                                    {loanApp.property_landmark && (
                                        <div>
                                            <p className="text-sm text-gray-500 mb-1">Current Power Sources</p>
                                            <p className="font-semibold text-gray-800">
                                                {loanApp.property_landmark}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Guarantor Information */}
                {loanApp?.guarantor && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <User className="text-[#273e8e]" size={20} />
                            <h3 className="text-lg font-semibold text-gray-800">Guarantor Information</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Full Name</p>
                                <p className="font-semibold text-gray-800">
                                    {loanApp.guarantor.full_name || 'N/A'}
                                </p>
                            </div>
                            {loanApp.guarantor.email && (
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">Email</p>
                                    <p className="font-semibold text-gray-800">
                                        {loanApp.guarantor.email}
                                    </p>
                                </div>
                            )}
                            {loanApp.guarantor.phone && (
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">Phone</p>
                                    <p className="font-semibold text-gray-800">
                                        {loanApp.guarantor.phone}
                                    </p>
                                </div>
                            )}
                            <div>
                                <p className="text-sm text-gray-500 mb-1">Status</p>
                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(loanApp.guarantor.status)}`}>
                                    {loanApp.guarantor.status?.toUpperCase() || 'PENDING'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Back Button */}
                <div className="flex justify-start">
                    <button
                        onClick={() => navigate('/bnpl-loans')}
                        className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
                    >
                        <ChevronLeft size={20} />
                        Back to Orders List
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#F5F7FF] flex">
            <SideBar />
            <div className="flex-1 flex flex-col">
                <TopNavbar />
                <div className="flex-1 p-6 overflow-y-auto">
                    <div className="max-w-7xl mx-auto">
                        {/* Header */}
                        <div className="mb-6">
                            <h1 className="text-3xl font-bold text-[#273e8e] mb-2">
                                {id ? 'BNPL Loan Details' : 'My BNPL Loans'}
                            </h1>
                            <p className="text-gray-600">
                                {id 
                                    ? 'Complete details of your Buy Now Pay Later loan'
                                    : 'View and manage all your Buy Now Pay Later applications and orders'}
                            </p>
                        </div>

                        {/* Loading State */}
                        {loading && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                                <Loading fullScreen={false} message="Loading loan details..." progress={null} />
                            </div>
                        )}

                        {/* Error State */}
                        {error && !loading && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
                                <div className="flex items-center">
                                    <AlertCircle className="text-red-600 mr-3" size={24} />
                                    <div>
                                        <h3 className="font-semibold text-red-800">Error</h3>
                                        <p className="text-red-600">{error}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Content */}
                        {!loading && !error && (
                            <>
                                {orderData?.isList ? renderOrderList() : renderOrderDetails()}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Payment Modal */}
            <BNPLPaymentModal
                installment={selectedInstallment}
                monoDebitMandate={orderData?.mono_debit_mandate}
                isOpen={showPaymentModal}
                onClose={() => {
                    setShowPaymentModal(false);
                    setSelectedInstallment(null);
                }}
                onSuccess={() => {
                    // Refresh order details after successful payment
                    if (id) {
                        if (id.startsWith('app-')) {
                            const applicationId = id.replace('app-', '');
                            fetchApplicationDetails(applicationId);
                        } else {
                            fetchOrderDetails(id);
                        }
                    } else {
                        fetchAllOrders();
                    }
                    // Refresh installments only for real orders (not pre-order partner/pending apps)
                    const token = localStorage.getItem('access_token');
                    const canRefreshInstallments =
                        token && id && !String(id).startsWith('app-');
                    if (canRefreshInstallments) {
                        axios.get(API.Loan_Payment_Relate, {
                            headers: { 
                                Authorization: `Bearer ${token}`,
                                Accept: 'application/json'
                            }
                        }).then(response => {
                            if (response.data.status === 'success' && response.data.data) {
                                setInstallmentsWithHistory(response.data.data);
                            }
                        }).catch(err => {
                            console.log('Could not refresh installments with history:', err);
                        });
                    }
                }}
            />
        </div>
    );
};

export default BNPLLoanDetails;
