import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SideBar from '../Component/SideBar';
import TopNavbar from '../Component/TopNavbar';
import axios from 'axios';
import API from '../config/api.config';
import { Loader, CheckCircle, XCircle, Clock, AlertCircle, FileText, ChevronLeft, ChevronRight, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import Loading from '../Component/Loading';
import { labelProductCategory } from '../Component/ProductCategoryGrid';

const BNPLCreditCheckStatus = () => {
    const navigate = useNavigate();
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [statusFilter, setStatusFilter] = useState('');
    const [expandedApplications, setExpandedApplications] = useState(new Set());
    const [applicationDetails, setApplicationDetails] = useState({}); // Store detailed application data
    const [loadingDetails, setLoadingDetails] = useState({}); // Track which applications are loading details
    const [pagination, setPagination] = useState({
        current_page: 1,
        last_page: 1,
        per_page: 15,
        total: 0,
        from: 0,
        to: 0
    });

    useEffect(() => {
        fetchApplications();
    }, [statusFilter]);

    const fetchApplications = async (page = 1) => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                setError('Please login to view credit check statuses');
                setLoading(false);
                return;
            }

            const params = new URLSearchParams();
            if (statusFilter) params.append('status', statusFilter);
            params.append('per_page', pagination.per_page);
            params.append('page', page);

            const response = await axios.get(`${API.BNPL_APPLICATIONS}?${params.toString()}`, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json'
                }
            });

            if (response.data.status === 'success') {
                setApplications(response.data.data.data || []);
                setPagination(response.data.data.pagination || {
                    current_page: 1,
                    last_page: 1,
                    per_page: 15,
                    total: 0,
                    from: 0,
                    to: 0
                });
            } else {
                setError(response.data.message || 'Failed to fetch applications');
            }
        } catch (err) {
            console.error('Error fetching applications:', err);
            setError(err.response?.data?.message || 'Failed to fetch credit check statuses');
            setApplications([]);
        } finally {
            setLoading(false);
        }
    };

    const handleApplicationClick = (app) => {
        // If approved, navigate to BNPLFlow with application ID
        if (app.status?.toLowerCase() === 'approved') {
            navigate(`/bnpl?applicationId=${app.id}`);
        } else {
            // For other statuses, show details in a modal or alert
            alert(`Application #${app.id} is ${app.status}. ${app.status === 'pending' ? 'Please wait for approval.' : app.status === 'rejected' ? 'Please contact support for more information.' : 'Please review the counter offer.'}`);
        }
    };

    const toggleApplicationDetails = async (appId, e) => {
        e.stopPropagation(); // Prevent triggering the parent click handler
        
        const isExpanded = expandedApplications.has(appId);
        
        if (isExpanded) {
            // Collapse
            setExpandedApplications(prev => {
                const newSet = new Set(prev);
                newSet.delete(appId);
                return newSet;
            });
        } else {
            // Expand - fetch details if not already loaded
            setExpandedApplications(prev => new Set(prev).add(appId));
            
            if (!applicationDetails[appId]) {
                setLoadingDetails(prev => ({ ...prev, [appId]: true }));
                try {
                    const token = localStorage.getItem('access_token');
                    const response = await axios.get(API.BNPL_STATUS(appId), {
                        headers: { 
                            Authorization: `Bearer ${token}`,
                            Accept: 'application/json'
                        }
                    });

                    if (response.data.status === 'success' && response.data.data) {
                        setApplicationDetails(prev => ({
                            ...prev,
                            [appId]: response.data.data
                        }));
                    }
                } catch (err) {
                    console.error('Error fetching application details:', err);
                } finally {
                    setLoadingDetails(prev => ({ ...prev, [appId]: false }));
                }
            }
        }
    };

    const getStatusIcon = (status) => {
        switch (status?.toLowerCase()) {
            case 'approved':
                return <CheckCircle size={24} className="text-green-600" />;
            case 'rejected':
                return <XCircle size={24} className="text-red-600" />;
            case 'counter_offer':
            case 'counter_offer_accepted':
                return <AlertCircle size={24} className="text-yellow-600" />;
            case 'pending':
            default:
                return <Clock size={24} className="text-blue-600" />;
        }
    };

    const getStatusBadge = (status) => {
        const statusLower = status?.toLowerCase() || 'pending';
        const badges = {
            approved: 'bg-green-100 text-green-800 border-green-300',
            rejected: 'bg-red-100 text-red-800 border-red-300',
            counter_offer: 'bg-yellow-100 text-yellow-800 border-yellow-300',
            counter_offer_accepted: 'bg-yellow-100 text-yellow-800 border-yellow-300',
            pending: 'bg-blue-100 text-blue-800 border-blue-300'
        };
        return badges[statusLower] || badges.pending;
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
        // Handle both string (formatted) and number amounts
        const numAmount = typeof amount === 'string' 
            ? parseFloat(amount.replace(/,/g, '')) 
            : amount;
        return new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN'
        }).format(numAmount || 0);
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= pagination.last_page) {
            fetchApplications(newPage);
        }
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
                                BNPL Credit Check Status
                            </h1>
                            <p className="text-gray-600">
                                View and track the status of your Buy Now Pay Later credit check applications
                            </p>
                        </div>

                        {/* Status Filter */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
                            <div className="flex items-center gap-4">
                                <Filter size={20} className="text-gray-600" />
                                <label className="text-sm font-medium text-gray-700">Filter by Status:</label>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => {
                                        setStatusFilter(e.target.value);
                                        setPagination(prev => ({ ...prev, current_page: 1 }));
                                    }}
                                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#273e8e] focus:border-[#273e8e]"
                                >
                                    <option value="">All Statuses</option>
                                    <option value="pending">Pending</option>
                                    <option value="approved">Approved</option>
                                    <option value="rejected">Rejected</option>
                                    <option value="counter_offer">Counter Offer</option>
                                    <option value="counter_offer_accepted">Counter Offer Accepted</option>
                                </select>
                                <button
                                    onClick={() => fetchApplications(pagination.current_page)}
                                    className="px-4 py-2 bg-[#273e8e] text-white rounded-lg font-semibold hover:bg-[#1a2b6b] transition-colors"
                                >
                                    Refresh
                                </button>
                            </div>
                        </div>


                        {/* Loading State */}
                        {loading && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                                <Loading fullScreen={false} message="Loading applications..." progress={null} />
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


                        {/* Applications List */}
                        {!loading && !error && applications.length > 0 && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6 flex flex-col" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                                <div className="p-6 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
                                    <h2 className="text-xl font-semibold text-gray-800">
                                        Your Applications ({pagination.total})
                                    </h2>
                                    {statusFilter && (
                                        <span className="text-sm text-gray-500">
                                            Filtered by: <span className="font-semibold capitalize">{statusFilter}</span>
                                        </span>
                                    )}
                                </div>
                                <div className="divide-y divide-gray-200 overflow-y-auto flex-1">
                                    {applications.map((app) => {
                                        const isExpanded = expandedApplications.has(app.id);
                                        const details = applicationDetails[app.id];
                                        const isLoadingDetails = loadingDetails[app.id];
                                        
                                        return (
                                            <div key={app.id} className="border-b border-gray-200 last:border-b-0">
                                                <div
                                                    className="p-6 hover:bg-gray-50 transition-colors cursor-pointer"
                                                    onClick={() => handleApplicationClick(app)}
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-4 flex-1">
                                                            {getStatusIcon(app.status)}
                                                            <div className="flex-1">
                                                                <p className="font-semibold text-gray-800">
                                                                    Application #{app.id}
                                                                </p>
                                                                <p className="text-sm text-gray-500">
                                                                    {formatCurrency(app.loan_amount)} • {app.repayment_duration} months • {app.customer_type}
                                                                </p>
                                                                {app.property_address && (
                                                                    <p className="text-xs text-gray-400 mt-1">
                                                                        {app.property_address}, {app.property_state}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(app.status)}`}>
                                                                {app.status?.toUpperCase().replace(/_/g, ' ') || 'PENDING'}
                                                            </span>
                                                            <p className="text-sm text-gray-500">
                                                                {formatDate(app.created_at)}
                                                            </p>
                                                            <button
                                                                onClick={(e) => toggleApplicationDetails(app.id, e)}
                                                                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                                                                aria-label={isExpanded ? "Collapse details" : "Expand details"}
                                                            >
                                                                {isExpanded ? (
                                                                    <ChevronUp size={20} className="text-gray-600" />
                                                                ) : (
                                                                    <ChevronDown size={20} className="text-gray-600" />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {app.guarantor && (
                                                        <div className="mt-3 pt-3 border-t border-gray-100">
                                                            <p className="text-xs text-gray-500">
                                                                Guarantor: <span className="font-semibold">{app.guarantor.full_name}</span> ({app.guarantor.status})
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                {/* Expanded Details */}
                                                {isExpanded && (
                                                    <div className="px-6 pb-6 bg-gray-50 border-t border-gray-200">
                                                        {isLoadingDetails ? (
                                                            <div className="py-8 text-center">
                                                                <Loader className="animate-spin mx-auto text-[#273e8e]" size={32} />
                                                                <p className="mt-2 text-sm text-gray-600">Loading details...</p>
                                                            </div>
                                                        ) : details ? (
                                                            <div className="pt-4 space-y-4">
                                                                {/* Status Badge */}
                                                                <div className="flex items-center gap-3">
                                                                    {getStatusIcon(details.status)}
                                                                    <span className={`px-4 py-2 rounded-full text-sm font-semibold border ${getStatusBadge(details.status)}`}>
                                                                        {details.status?.toUpperCase().replace(/_/g, ' ') || 'PENDING'}
                                                                    </span>
                                                                </div>

                                                                {/* Loan Calculation Section */}
                                                                {details.loan_calculation && (
                                                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                                                        <h3 className="font-semibold text-gray-800 mb-3">Loan Calculation</h3>
                                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                                            <div>
                                                                                <p className="text-sm text-gray-500 mb-1">Loan Amount</p>
                                                                                <p className="font-semibold text-gray-800">
                                                                                    {formatCurrency(details.loan_calculation.loan_amount)}
                                                                                </p>
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-sm text-gray-500 mb-1">Down Payment</p>
                                                                                <p className="font-semibold text-gray-800">
                                                                                    {formatCurrency(details.loan_calculation.down_payment)}
                                                                                </p>
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-sm text-gray-500 mb-1">Total Amount</p>
                                                                                <p className="font-semibold text-gray-800">
                                                                                    {formatCurrency(details.loan_calculation.total_amount)}
                                                                                </p>
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-sm text-gray-500 mb-1">Interest Rate</p>
                                                                                <p className="font-semibold text-gray-800">
                                                                                    {details.loan_calculation.interest_rate || 'N/A'}%
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Application Info */}
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                                                                    <div>
                                                                        <p className="text-sm text-gray-500 mb-1">Application ID</p>
                                                                        <p className="font-semibold text-gray-800">#{details.id}</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm text-gray-500 mb-1">Loan Amount</p>
                                                                        <p className="font-semibold text-gray-800">
                                                                            {formatCurrency(details.loan_amount)}
                                                                        </p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm text-gray-500 mb-1">Repayment Duration</p>
                                                                        <p className="font-semibold text-gray-800">
                                                                            {details.repayment_duration || 'N/A'} months
                                                                        </p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm text-gray-500 mb-1">Credit Check Method</p>
                                                                        <p className="font-semibold text-gray-800 capitalize">
                                                                            {details.credit_check_method || 'N/A'}
                                                                        </p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm text-gray-500 mb-1">Customer Type</p>
                                                                        <p className="font-semibold text-gray-800 capitalize">
                                                                            {details.customer_type || 'N/A'}
                                                                        </p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm text-gray-500 mb-1">Solution</p>
                                                                        <p className="font-semibold text-gray-800">
                                                                            {labelProductCategory(details.product_category) || 'N/A'}
                                                                        </p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm text-gray-500 mb-1">Property State</p>
                                                                        <p className="font-semibold text-gray-800">
                                                                            {details.property_state || 'N/A'}
                                                                        </p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm text-gray-500 mb-1">Property Address</p>
                                                                        <p className="font-semibold text-gray-800">
                                                                            {details.property_address || 'N/A'}
                                                                        </p>
                                                                    </div>
                                                                    {details.property_landmark && (
                                                                        <div>
                                                                            <p className="text-sm text-gray-500 mb-1">Current Power Sources</p>
                                                                            <p className="font-semibold text-gray-800">
                                                                                {details.property_landmark}
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                    {details.property_floors && (
                                                                        <div>
                                                                            <p className="text-sm text-gray-500 mb-1">Floors</p>
                                                                            <p className="font-semibold text-gray-800">
                                                                                {details.property_floors}
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                    {details.property_rooms && (
                                                                        <div>
                                                                            <p className="text-sm text-gray-500 mb-1">Rooms</p>
                                                                            <p className="font-semibold text-gray-800">
                                                                                {details.property_rooms}
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                    {details.is_gated_estate && (
                                                                        <>
                                                                            {details.estate_name && (
                                                                                <div>
                                                                                    <p className="text-sm text-gray-500 mb-1">Estate Name</p>
                                                                                    <p className="font-semibold text-gray-800">
                                                                                        {details.estate_name}
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                            {details.estate_address && (
                                                                                <div>
                                                                                    <p className="text-sm text-gray-500 mb-1">Estate Address</p>
                                                                                    <p className="font-semibold text-gray-800">
                                                                                        {details.estate_address}
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                    {details.social_media_handle && (
                                                                        <div>
                                                                            <p className="text-sm text-gray-500 mb-1">Social Media Handle</p>
                                                                            <p className="font-semibold text-gray-800">
                                                                                {details.social_media_handle}
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                    <div>
                                                                        <p className="text-sm text-gray-500 mb-1">Submitted On</p>
                                                                        <p className="font-semibold text-gray-800">
                                                                            {formatDate(details.created_at)}
                                                                        </p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm text-gray-500 mb-1">Last Updated</p>
                                                                        <p className="font-semibold text-gray-800">
                                                                            {formatDate(details.updated_at)}
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                {/* Guarantor Section */}
                                                                {details.guarantor && (
                                                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
                                                                        <h3 className="font-semibold text-gray-800 mb-3">Guarantor Information</h3>
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                            <div>
                                                                                <p className="text-sm text-gray-500 mb-1">Full Name</p>
                                                                                <p className="font-semibold text-gray-800">
                                                                                    {details.guarantor.full_name || 'N/A'}
                                                                                </p>
                                                                            </div>
                                                                            {details.guarantor.email && (
                                                                                <div>
                                                                                    <p className="text-sm text-gray-500 mb-1">Email</p>
                                                                                    <p className="font-semibold text-gray-800">
                                                                                        {details.guarantor.email}
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                            {details.guarantor.phone && (
                                                                                <div>
                                                                                    <p className="text-sm text-gray-500 mb-1">Phone</p>
                                                                                    <p className="font-semibold text-gray-800">
                                                                                        {details.guarantor.phone}
                                                                                    </p>
                                                                                </div>
                                                                            )}
                                                                            <div>
                                                                                <p className="text-sm text-gray-500 mb-1">Status</p>
                                                                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(details.guarantor.status)}`}>
                                                                                    {details.guarantor.status?.toUpperCase() || 'PENDING'}
                                                                                </span>
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-sm text-gray-500 mb-1">Form Signed</p>
                                                                                <p className="font-semibold text-gray-800">
                                                                                    {details.guarantor.has_signed_form ? 'Yes' : 'No'}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Status Messages */}
                                                                {details.status === 'pending' && (
                                                                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                                                        <p className="text-sm text-blue-700">
                                                                            <strong>Status:</strong> Your application is under review. This usually takes 24-72 hours.
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                {details.status === 'approved' && (
                                                                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                                                                        <p className="text-sm text-green-700 mb-3">
                                                                            <strong>Congratulations!</strong> Your application has been approved. Please proceed with the upfront deposit payment.
                                                                        </p>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                navigate(`/bnpl?applicationId=${details.id}`);
                                                                            }}
                                                                            className="px-4 py-2 bg-[#273e8e] text-white rounded-lg font-semibold hover:bg-[#1a2b6b] transition-colors"
                                                                        >
                                                                            Proceed to Payment
                                                                        </button>
                                                                    </div>
                                                                )}

                                                                {details.status === 'rejected' && (
                                                                    <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                                                                        <p className="text-sm text-red-700">
                                                                            <strong>Status:</strong> Your application has been rejected. Please contact support for more information.
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                {details.status === 'counter_offer' && (
                                                                    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                                                        <p className="text-sm text-yellow-700">
                                                                            <strong>Counter Offer Available:</strong> A counter offer has been made for your application. Please review and respond.
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                {details.status === 'counter_offer_accepted' && (
                                                                    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                                                        <p className="text-sm text-yellow-700">
                                                                            <strong>Counter Offer Accepted:</strong> You have accepted the counter offer. Your application is being processed.
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="py-4 text-center text-sm text-red-600">
                                                                Failed to load application details. Please try again.
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Pagination */}
                                {pagination.last_page > 1 && (
                                    <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                                        <div className="text-sm text-gray-600">
                                            Showing {pagination.from} to {pagination.to} of {pagination.total} applications
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handlePageChange(pagination.current_page - 1)}
                                                disabled={pagination.current_page === 1}
                                                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <ChevronLeft size={20} />
                                            </button>
                                            <span className="px-4 py-2 text-sm font-medium text-gray-700">
                                                Page {pagination.current_page} of {pagination.last_page}
                                            </span>
                                            <button
                                                onClick={() => handlePageChange(pagination.current_page + 1)}
                                                disabled={pagination.current_page === pagination.last_page}
                                                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <ChevronRight size={20} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Empty State */}
                        {!loading && !error && applications.length === 0 && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                                <FileText size={64} className="mx-auto text-gray-400 mb-4" />
                                <h3 className="text-xl font-semibold text-gray-800 mb-2">
                                    No Applications Found
                                </h3>
                                <p className="text-gray-600 mb-6">
                                    {statusFilter 
                                        ? `No applications found with status "${statusFilter}". Try selecting a different filter.`
                                        : "You haven't submitted any BNPL applications yet."}
                                </p>
                                {statusFilter && (
                                    <button
                                        onClick={() => setStatusFilter('')}
                                        className="px-4 py-2 bg-[#273e8e] text-white rounded-lg font-semibold hover:bg-[#1a2b6b] transition-colors"
                                    >
                                        Clear Filter
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BNPLCreditCheckStatus;
