import React, { useState, useEffect } from 'react';
import { X, Wallet, CreditCard, Building, ArrowRight } from 'lucide-react';
import axios from 'axios';
import API, { FLUTTERWAVE_PUBLIC_KEY } from '../config/api.config';

/* ---------------- Load Flutterwave Script ---------------- */
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

const BNPLPaymentModal = ({ installment, monoDebitMandate, isOpen, onClose, onSuccess }) => {
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [walletType, setWalletType] = useState('shop');
  const [walletBalance, setWalletBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && installment) {
      fetchWalletBalance();
    }
  }, [isOpen, installment]);

  const fetchWalletBalance = async () => {
    setLoadingWallet(true);
    setError(null);
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setError('Please login to view wallet balance');
        setLoadingWallet(false);
        return;
      }

      const response = await axios.get(API.LOAN_WALLET, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });

      if (response.data.status === 'success' && response.data.data) {
        setWalletBalance(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching wallet balance:', err);
      setError('Failed to load wallet balance');
    } finally {
      setLoadingWallet(false);
    }
  };

  const handleClose = () => {
    setPaymentMethod('wallet');
    setWalletType('shop');
    setError(null);
    onClose();
  };

  const handleWalletPayment = async () => {
    if (!installment || !installment.id) {
      setError('Invalid installment');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setError('Please login to proceed');
        setLoading(false);
        return;
      }

      // Check balance
      const balance = walletType === 'shop' 
        ? parseFloat(walletBalance?.shop_balance || 0)
        : parseFloat(walletBalance?.loan_balance || 0);
      
      const amount = parseFloat(installment.amount || 0);

      if (balance < amount) {
        setError(`Insufficient ${walletType} balance. Available: ₦${balance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        setLoading(false);
        return;
      }

      const payload = {
        method: 'wallet',
        type: walletType,
        reference: `INSTALLMENT#${installment.id}`
      };

      const response = await axios.post(API.Loan_Payment_Repay(installment.id), payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (response.data.status === 'success') {
        alert('Payment successful!');
        handleClose();
        if (onSuccess) onSuccess();
      } else {
        setError(response.data.message || 'Payment failed');
      }
    } catch (err) {
      console.error('Wallet payment error:', err);
      const errorMsg = err.response?.data?.message 
        || (err.response?.data?.errors && Object.values(err.response.data.errors).flat().join(', '))
        || 'Payment failed. Please try again.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGatewayPayment = async () => {
    if (!installment || !installment.id) {
      setError('Invalid installment');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await ensureFlutterwave();

      const amount = parseFloat(installment.amount || 0);
      const txRef = `INSTALLMENT#${installment.id}-${Date.now()}`;

      // Get user info from localStorage (try multiple keys like rest of codebase)
      const CANDIDATE_KEYS = ['user', 'auth_user', 'current_user', 'profile', 'logged_in_user', 'user_info'];
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
        } catch (e) {
          // Continue to next key
        }
      }
      
      // Extract user details with fallbacks
      const userEmail = userInfo?.email || userInfo?.user_email || 'customer@troosolar.com';
      const userName = userInfo?.name 
        || userInfo?.full_name 
        || (userInfo?.first_name && userInfo?.sur_name ? `${userInfo.first_name} ${userInfo.sur_name}` : null)
        || (userInfo?.first_name && userInfo?.last_name ? `${userInfo.first_name} ${userInfo.last_name}` : null)
        || 'Customer';
      const userPhone = userInfo?.phone || userInfo?.phone_number || '';

      window.FlutterwaveCheckout({
        public_key: FLUTTERWAVE_PUBLIC_KEY,
        tx_ref: txRef,
        amount: amount,
        currency: 'NGN',
        payment_options: 'card,ussd,banktransfer',
        customer: {
          email: userEmail,
          name: userName,
          ...(userPhone ? { phone_number: userPhone } : {})
        },
        callback: async (response) => {
          console.log('Flutterwave response:', response);

          if (response?.status === 'successful') {
            if (typeof window.closePaymentModal === 'function') {
              window.closePaymentModal();
            }
            try {
              const token = localStorage.getItem('access_token');
              if (!token) {
                alert('Session expired. Please log in again.');
                setLoading(false);
                return;
              }

              // Normalize transaction ID - Flutterwave returns transaction_id
              const txId = response?.transaction_id 
                || response?.id 
                || response?.data?.id 
                || response?.transaction?.id 
                || response?.flw_ref
                || txRef;

              // Map payment method to API method
              // paymentMethod can be 'card', 'bank', or 'transfer'
              // API expects: 'wallet', 'bank', 'card', or 'transfer'
              let apiMethod = paymentMethod;
              if (paymentMethod === 'card') {
                apiMethod = 'card';
              } else if (paymentMethod === 'bank') {
                apiMethod = 'bank';
              } else {
                apiMethod = 'transfer'; // Default for other gateway methods
              }

              const payload = {
                method: apiMethod,
                tx_id: String(txId),
                reference: txRef,
                title: 'Loan Installment Payment'
              };

              const confirmResponse = await axios.post(
                API.Loan_Payment_Repay(installment.id),
                payload,
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                  }
                }
              );

              if (confirmResponse.data.status === 'success') {
                alert('Payment successful!');
                handleClose();
                if (onSuccess) onSuccess();
              } else {
                setError(confirmResponse.data.message || 'Payment confirmation failed');
              }
            } catch (err) {
              console.error('Payment confirmation error:', err);
              const errorMsg = err.response?.data?.message 
                || (err.response?.data?.errors && Object.values(err.response.data.errors).flat().join(', '))
                || 'Payment succeeded but confirmation failed. Please contact support.';
              setError(errorMsg);
            } finally {
              setLoading(false);
            }
          } else {
            setError('Payment was not completed');
            setLoading(false);
          }
        },
        onclose: () => {
          console.log('Flutterwave modal closed');
          setLoading(false);
        },
        customizations: {
          title: 'Loan Installment Payment',
          description: `Installment #${installment.installment_number || installment.id}`,
          logo: 'https://yourdomain.com/logo.png'
        }
      });
    } catch (err) {
      console.error('Payment init failed:', err);
      setError('Failed to initialize payment. Please try again.');
      setLoading(false);
    }
  };

  const handleMonoDebitPayment = async () => {
    if (!installment?.id) {
      setError('Invalid installment');
      return;
    }
    if (!monoDebitMandate?.ready_to_debit) {
      setError('Mono Direct Debit is not ready yet. Set up or complete mandate authorization on your loan page.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('access_token');
      const response = await axios.post(
        API.BNPL_INSTALLMENT_MONO_DEBIT(installment.id),
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );
      if (response.data?.status === 'success') {
        alert('Installment debited from your linked bank account.');
        handleClose();
        if (onSuccess) onSuccess();
      } else {
        setError(response.data?.message || 'Bank debit failed');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Bank debit failed. Try card/bank transfer or wallet.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (paymentMethod === 'wallet') {
      await handleWalletPayment();
    } else if (paymentMethod === 'mono_debit') {
      await handleMonoDebitPayment();
    } else {
      await handleGatewayPayment();
    }
  };

  if (!isOpen || !installment) return null;

  const amount = parseFloat(installment.amount || 0);
  const shopBalance = parseFloat(walletBalance?.shop_balance || 0);
  const loanBalance = parseFloat(walletBalance?.loan_balance || 0);
  const isOverdue = new Date(installment.due_date) < new Date() && installment.status !== 'paid';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            Pay Installment
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Installment Details */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Installment #</span>
              <span className="text-sm font-semibold text-gray-800">
                {installment.installment_number || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Amount</span>
              <span className="text-lg font-bold text-[#273e8e]">
                ₦{amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Due Date</span>
              <span className="text-sm font-semibold text-gray-800">
                {new Date(installment.due_date).toLocaleDateString('en-NG')}
              </span>
            </div>
            {isOverdue && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                ⚠️ This installment is overdue
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Payment Method Selection */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Payment Method
            </label>
            <div className="space-y-2">
              {/* Wallet Option */}
              <button
                type="button"
                onClick={() => setPaymentMethod('wallet')}
                className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                  paymentMethod === 'wallet'
                    ? 'border-[#273e8e] bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Wallet className="text-[#273e8e]" size={20} />
                    <div>
                      <p className="font-semibold text-gray-800">Wallet Payment</p>
                      <p className="text-xs text-gray-500">Pay from your wallet balance</p>
                    </div>
                  </div>
                  {paymentMethod === 'wallet' && (
                    <div className="w-4 h-4 rounded-full bg-[#273e8e] border-2 border-white"></div>
                  )}
                </div>
              </button>

              {monoDebitMandate?.ready_to_debit && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('mono_debit')}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    paymentMethod === 'mono_debit'
                      ? 'border-[#273e8e] bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Building className="text-[#273e8e]" size={20} />
                      <div>
                        <p className="font-semibold text-gray-800">Debit from linked bank</p>
                        <p className="text-xs text-gray-500">Mono Direct Debit — one-tap from your bank account</p>
                      </div>
                    </div>
                    {paymentMethod === 'mono_debit' && (
                      <div className="w-4 h-4 rounded-full bg-[#273e8e] border-2 border-white"></div>
                    )}
                  </div>
                </button>
              )}

              {/* Card Option */}
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                  paymentMethod === 'card'
                    ? 'border-[#273e8e] bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CreditCard className="text-[#273e8e]" size={20} />
                    <div>
                      <p className="font-semibold text-gray-800">Card Payment</p>
                      <p className="text-xs text-gray-500">Pay with debit/credit card</p>
                    </div>
                  </div>
                  {paymentMethod === 'card' && (
                    <div className="w-4 h-4 rounded-full bg-[#273e8e] border-2 border-white"></div>
                  )}
                </div>
              </button>

              {/* Bank Transfer Option */}
              <button
                type="button"
                onClick={() => setPaymentMethod('bank')}
                className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                  paymentMethod === 'bank'
                    ? 'border-[#273e8e] bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building className="text-[#273e8e]" size={20} />
                    <div>
                      <p className="font-semibold text-gray-800">Bank Transfer</p>
                      <p className="text-xs text-gray-500">Transfer from your bank account</p>
                    </div>
                  </div>
                  {paymentMethod === 'bank' && (
                    <div className="w-4 h-4 rounded-full bg-[#273e8e] border-2 border-white"></div>
                  )}
                </div>
              </button>

              {/* Direct Transfer Option */}
              <button
                type="button"
                onClick={() => setPaymentMethod('transfer')}
                className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                  paymentMethod === 'transfer'
                    ? 'border-[#273e8e] bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ArrowRight className="text-[#273e8e]" size={20} />
                    <div>
                      <p className="font-semibold text-gray-800">Direct Transfer</p>
                      <p className="text-xs text-gray-500">Direct bank transfer via payment gateway</p>
                    </div>
                  </div>
                  {paymentMethod === 'transfer' && (
                    <div className="w-4 h-4 rounded-full bg-[#273e8e] border-2 border-white"></div>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Wallet Type Selection (if wallet selected) */}
          {paymentMethod === 'wallet' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Wallet Type
              </label>
              {loadingWallet ? (
                <div className="p-4 text-center text-sm text-gray-500">
                  Loading wallet balance...
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setWalletType('shop')}
                    className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                      walletType === 'shop'
                        ? 'border-[#273e8e] bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-800">Shop Balance</p>
                        <p className="text-xs text-gray-500">
                          Available: ₦{shopBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      {shopBalance < amount && (
                        <span className="text-xs text-red-600">Insufficient</span>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalletType('loan')}
                    className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                      walletType === 'loan'
                        ? 'border-[#273e8e] bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-800">Loan Balance</p>
                        <p className="text-xs text-gray-500">
                          Available: ₦{loanBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      {loanBalance < amount && (
                        <span className="text-xs text-red-600">Insufficient</span>
                      )}
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || (paymentMethod === 'wallet' && loadingWallet)}
            className="w-full py-3 px-6 bg-[#273e8e] text-white font-medium rounded-lg hover:bg-[#1e2f6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Processing...</span>
            ) : (
              <>
                <span>Pay ₦{amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default BNPLPaymentModal;

