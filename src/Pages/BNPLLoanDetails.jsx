import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SideBar from '../Component/SideBar';
import TopNavbar from '../Component/TopNavbar';
import axios from 'axios';
import API from '../config/api.config';
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
                                orderDetails.repayment_schedule = scheduleResponse.data.data.installments || scheduleResponse.data.data || scheduleResponse.data.data.schedule;
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
                              depositPercent: snap.depositPercent,
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
                    };
                };
                const mappedFromApiLd = mapApiLoanDetails(orderDetails.loan_details);

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
                
                // Try to fetch repayment schedule for the application
                let repaymentSchedule = [];
                try {
                    const scheduleResponse = await axios.get(API.BNPL_REPAYMENT_SCHEDULE(applicationId), {
                        headers: { 
                            Authorization: `Bearer ${token}`,
                            Accept: 'application/json'
                        }
                    });
                    
                    if (scheduleResponse.data.status === 'success' && scheduleResponse.data.data) {
                        repaymentSchedule = scheduleResponse.data.data.installments || scheduleResponse.data.data.schedule || scheduleResponse.data.data || [];
                    }
                } catch (scheduleErr) {
                    console.log('Could not fetch repayment schedule:', scheduleErr);
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
                        // If repayment schedule is empty, use current_month and history from installments
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
                              depositPercent: snap.depositPercent,
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
                    counter_offer_min_deposit: appData.counter_offer_min_deposit,
                    counter_offer_min_tenor: appData.counter_offer_min_tenor,
                    counter_offer_details: appData.counter_offer_details,
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

    const getStatusIcon = (status) => {
        switch (status?.toLowerCase()) {
            case 'approved':
            case 'active':
            case 'completed':
            case 'paid':
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
            rejected: 'bg-red-100 text-red-800 border-red-300',
            cancelled: 'bg-red-100 text-red-800 border-red-300',
            pending: 'bg-blue-100 text-blue-800 border-blue-300',
            processing: 'bg-yellow-100 text-yellow-800 border-yellow-300',
            overdue: 'bg-red-100 text-red-800 border-red-300',
            counter_offer: 'bg-yellow-100 text-yellow-800 border-yellow-300',
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

    const handlePayDownPayment = async () => {
        if (!id || !id.startsWith('app-')) return;
        const applicationId = id.replace('app-', '');
        const order = orderData;
        if (!order?.loan_calculation?.down_payment) return;
        const downPaymentAmount = parseAmount(order.loan_calculation.down_payment);
        if (downPaymentAmount <= 0) return;

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
                public_key: 'FLWPUBK_TEST-dd1514f7562b1d623c4e63fb58b6aedb-X',
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
                    title: 'BNPL Down Payment',
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
            return new Date(dateString).toLocaleDateString('en-NG', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return dateString;
        }
    };

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
                        const itemStatus = item.status;
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
        
        // For applications, use application status
        if (isApplication && order.status) {
            return order.status;
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
                            <div className="space-y-3">
                                {/* Get counter offer from root level fields or counter_offer_details */}
                                {(() => {
                                    const minDeposit = order.counter_offer_min_deposit || order.counter_offer_details?.down_payment;
                                    const minTenor = order.counter_offer_min_tenor || order.counter_offer_details?.repayment_duration;
                                    const monthlyPayment = order.counter_offer_details?.monthly_payment;
                                    const totalAmount = order.counter_offer_details?.total_amount;
                                    
                                    return (
                                        <>
                                            {minDeposit && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-600">Minimum Deposit:</span>
                                                    <span className="font-bold text-lg text-gray-800">
                                                        {formatCurrency(minDeposit)}
                                                    </span>
                                                </div>
                                            )}
                                            {minTenor && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-600">Minimum Tenor:</span>
                                                    <span className="font-bold text-lg text-gray-800">
                                                        {minTenor} months
                                                    </span>
                                                </div>
                                            )}
                                            {monthlyPayment && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-600">Monthly Payment:</span>
                                                    <span className="font-bold text-lg text-[#273e8e]">
                                                        {formatCurrency(monthlyPayment)}
                                                    </span>
                                                </div>
                                            )}
                                            {totalAmount && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-600">Total Repayment Amount:</span>
                                                    <span className="font-bold text-lg text-gray-800">
                                                        {formatCurrency(totalAmount)}
                                                    </span>
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

                                        // Get counter offer details from root level fields or counter_offer_details
                                        const minimumDeposit = order.counter_offer_min_deposit || order.counter_offer_details?.down_payment
                                            ? parseAmount(order.counter_offer_min_deposit || order.counter_offer_details.down_payment)
                                            : loanCalc?.down_payment 
                                                ? parseAmount(loanCalc.down_payment)
                                                : 0;
                                        
                                        const minimumTenor = order.counter_offer_min_tenor || order.counter_offer_details?.repayment_duration
                                            || loanCalc?.repayment_duration 
                                            || loanCalc?.tenor 
                                            || 12;

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

                {/* Down payment completed – show order link when application has an order */}
                {isApplication && (order.order_id || order.down_payment_completed) && (
                    <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="text-green-600" size={28} />
                                <div>
                                    <h3 className="text-lg font-semibold text-green-800">Down payment completed</h3>
                                    <p className="text-sm text-green-700">Your BNPL order has been placed. View your order for repayment schedule and installments.</p>
                                    {order.order_number && <p className="text-sm text-green-600 mt-1">Order #{order.order_number}</p>}
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

                {/* Forms section – Download + Upload (approved BNPL, application or order view) */}
                {displayStatus?.toLowerCase() === 'approved' && (isApplication && id?.startsWith('app-') || (!isApplication && loanApp)) && (() => {
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
                {!isApplication && loanApp && displayStatus?.toLowerCase() === 'approved' && (order.payment_status === 'paid' || order.down_payment_completed) && (() => {
                    const instDate = loanApp.installation_requested_date;
                    const instStatus = loanApp.installation_booking_status;
                    const rejectedDates = loanApp.installation_rejected_dates || [];
                    const minDate = (() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 3); // 72h = 3 days
                        return d.toISOString().slice(0, 10);
                    })();
                    const isSunday = (dateStr) => new Date(dateStr).getDay() === 0;
                    const refetch = () => id ? fetchOrderDetails(id) : null;
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
                                        <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-4">
                                            <p className="text-red-800">Your requested date could not be confirmed. Please choose another date below (Sundays and previously rejected dates are not available).</p>
                                        </div>
                                    )}
                                    {!instDate && (
                                        <p className="text-sm text-gray-500 mb-4">Choose a date at least 72 hours from today. Sundays are not available.</p>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => { setShowBookInstallationModal(true); setBookingInstallationDate(''); }}
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

                {/* Repayment Summary — only show for approved loans */}
                {displayStatus?.toLowerCase() === 'approved' && repaymentSummary && Object.keys(repaymentSummary).length > 0 && (
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
                {(loanCalc || ld) && (() => {
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

                    // Prefer snapshot / loan_details from apply flow, then GET /bnpl/status loan_calculation.
                    const statusLower = String(displayStatus || '').toLowerCase();
                    const isCounterOfferAccepted = statusLower === 'counter_offer_accepted';
                    const acceptedMinDeposit = pickNum(
                        order?.counter_offer_min_deposit,
                        order?.counter_offer_details?.down_payment
                    );
                    const acceptedMinTenor = pickNum(
                        order?.counter_offer_min_tenor,
                        order?.counter_offer_details?.repayment_duration
                    );
                    const insurancePct = pickNum(ld?.insurancePct, ld?.insurance_fee_percentage, ld?.feePercentages?.insurance) || 3;
                    const managementPct = pickNum(ld?.managementPct, ld?.management_fee_percentage, ld?.feePercentages?.management) || 1;
                    const legalPct = pickNum(ld?.legalPct, ld?.legal_fee_percentage, ld?.feePercentages?.legal) || 1;
                    const iPct = insurancePct / 100;
                    const mPct = managementPct / 100;
                    const lPct = legalPct / 100;
                    const totalAmount = pickNum(
                        ld?.totalAmount,
                        ld?.total_amount,
                        loanCalc?.total_amount
                    );
                    const adminFeesTotal = pickNum(
                        ld?.adminFeesTotal,
                        (pickNum(ld?.insuranceFee, 0) + pickNum(ld?.managementFee, 0) + pickNum(ld?.legalFee, 0))
                    );
                    const initialDepositWithFees = isCounterOfferAccepted && acceptedMinDeposit > 0
                        ? acceptedMinDeposit
                        : pickNum(
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
                    const depositPercentRaw = pickNum(ld?.depositPercent);
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
                    const interestRatePercent =
                        parseInterestRate(ld?.interestRate) ??
                        parseInterestRate(ld?.interest_rate) ??
                        parseInterestRate(loanCalc?.interest_rate) ??
                        DEFAULT_BNPL_INTEREST_RATE_PERCENT;
                    // Prefer application / snapshot tenor — mono row can be wrong (e.g. default 12)
                    const tenor = Number(
                        (isCounterOfferAccepted && acceptedMinTenor > 0 ? acceptedMinTenor : null) ??
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

                    if (isCounterOfferAccepted && acceptedMinDeposit > 0 && bundlePriceApprox > 0) {
                        const denom = 1 - mPct - lPct;
                        const baseDeposit =
                            denom > 0.0001
                                ? Math.max((acceptedMinDeposit - bundlePriceApprox * (iPct + mPct + lPct)) / denom, 0)
                                : 0;
                        const baseLoanAmount = Math.max(bundlePriceApprox - baseDeposit, 0);
                        totalLoanAmount = baseLoanAmount;
                        totalInterestAmount = (interestRatePercent / 100) * baseLoanAmount * tenor;
                        totalRepaymentAmount = baseLoanAmount + totalInterestAmount;
                        monthlyRepaymentAmount = tenor > 0 ? totalRepaymentAmount / tenor : 0;
                        depositPercentForLabel =
                            bundlePriceApprox > 0 ? Math.round((baseDeposit / bundlePriceApprox) * 100) : depositPercentForLabel;
                    }
                    const depositLabelPct =
                        depositPercentForLabel > 0 ? `${depositPercentForLabel}%` : '—';
                    const summaryRows = [
                        {
                            label: `Initial Deposit (${depositLabelPct}) + Total Administrative Fees`,
                            value: initialDepositWithFees,
                        },
                        { label: 'Total Loan Amount', value: totalLoanAmount },
                        { label: `Total Interest Amount (${interestRatePercent}% × ${tenor} mo)`, value: totalInterestAmount },
                        { label: 'Total Repayment Amount', value: totalRepaymentAmount },
                        { label: 'Monthly Repayment Amount', value: monthlyRepaymentAmount },
                    ];
                    return (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl shadow-sm border border-green-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <span className="text-[#273e8e] text-2xl font-bold" aria-hidden="true">₦</span>
                            <h3 className="text-xl font-semibold text-gray-800">Loan Summary</h3>
                        </div>
                        <div className="space-y-3">
                            {summaryRows.map((row, index) => (
                                <div key={row.label} className="bg-white rounded-lg p-4 border border-green-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                    <p className="text-sm font-medium text-gray-800">{row.label}</p>
                                    <p className={`text-xl font-bold ${index === 4 ? 'text-[#273e8e]' : 'text-gray-800'}`}>
                                        {formatCurrency(row.value)}
                                    </p>
                                </div>
                            ))}
                            <div className="border-t border-green-200 pt-3 mt-1">
                                <div className="bg-white rounded-lg p-4 border border-green-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                    <p className="text-sm font-medium text-gray-800">Loan Tenor</p>
                                    <p className="text-xl font-bold text-[#273e8e]">
                                        {tenor} {tenor === 1 ? 'month' : 'months'}
                                    </p>
                                </div>
                            </div>
                        </div>
                        {/* Pay Down Payment – show when approved, down payment not yet paid, and no order yet */}
                        {isApplication &&
                            (displayStatus?.toLowerCase() === 'approved' || displayStatus?.toLowerCase() === 'counter_offer_accepted') &&
                            !order.order_id &&
                            !order.down_payment_completed &&
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

                {/* Overdue Warning Banner */}
                {installmentsWithHistory?.hasOverdue && (
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
                {repaymentSchedule && repaymentSchedule.length > 0 && (
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
                {installmentsWithHistory?.current_month && installmentsWithHistory.current_month.length > 0 && (
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
                                                            setSelectedInstallment(installment);
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
                {repaymentSchedule && repaymentSchedule.length > 0 && (
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
                {repaymentSchedule && repaymentSchedule.length > 0 && (
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
                                        const isOverdue = new Date(installment.due_date) < new Date() && installment.status !== 'paid';
                                        const canPay = installment.status !== 'paid' && installment.id;
                                        return (
                                            <tr key={installment.id || index} className={isOverdue ? 'bg-red-50' : ''}>
                                                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                                    {installment.installment_number || index + 1}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-700">
                                                    {formatDate(installment.due_date)}
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
                                                    {installment.payment_date ? formatDate(installment.payment_date) : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-sm">
                                                    {canPay ? (
                                                        <button
                                                            onClick={() => {
                                                                setSelectedInstallment(installment);
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
                                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(loanApp.status)}`}>
                                        {loanApp.status?.toUpperCase().replace(/_/g, ' ') || 'PENDING'}
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
                    // Also refresh installments with history
                    const token = localStorage.getItem('access_token');
                    if (token) {
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
