import { Eye, EyeOff, X } from "lucide-react";
import React, { useState, useEffect } from "react";
import { assets } from "../assets/data";
import axios from "axios";
import API, { FLUTTERWAVE_PUBLIC_KEY } from "../config/api.config";

const ShoppingWallet = () => {
  const [showAmount, setShowAmount] = useState(true); // true => amount visible (eye open), false => hidden (eye closed)
  const [showDialog, setShowDialog] = useState(false);
  const [amountInput, setAmountInput] = useState("1000");
  const [loading, setLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [balance, setBalance] = useState(0);
  const [lastTransaction, setLastTransaction] = useState(0);

  // Fetch wallet data on component mount
  useEffect(() => {
    const fetchWallet = async () => {
      setWalletLoading(true);
      try {
        const token = localStorage.getItem("access_token");
        if (!token) {
          return;
        }

        const { data } = await axios.get(API.LOAN_WALLET, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        // Extract shop_balance from the API response
        const walletData = data?.data;
        if (walletData && typeof walletData === "object") {
          setBalance(Number(walletData["shop_balance"] || 0));
          // For now, set last transaction same as balance (you can modify this based on your needs)
          setLastTransaction(Number(walletData["shop_balance"] || 0));
        }
      } catch (error) {
        console.error("Failed to fetch wallet data:", error);
        // Keep default values (0) on error
      } finally {
        setWalletLoading(false);
      }
    };

    fetchWallet();
  }, []);

  // Load Flutterwave script once when needed
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

  // Send topup to your backend after successful payment
  const postTopupToBackend = async ({ amountNumber, transactionId }) => {
    const payload = {
      amount: String(amountNumber),
      txId: String(transactionId),
    };

    // Optional bearer token if your API requires auth
    const token = localStorage.getItem("access_token");
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    console.log("➡️ Sending to backend (Fund_Wallet):", payload);
    const res = await axios.post(API.Fund_Wallet, payload, { headers });
    console.log("✅ Backend response (Fund_Wallet):", res?.data);
    return res?.data;
  };

  const startPayment = async (amountNumber) => {
    try {
      setLoading(true);
      await ensureFlutterwave();
      const txRef = "txref_" + Date.now();

      window.FlutterwaveCheckout({
        public_key: FLUTTERWAVE_PUBLIC_KEY,
        tx_ref: txRef,
        amount: amountNumber,
        currency: "NGN",
        payment_options: "card,ussd",
        customer: {
          email: "test@example.com",
          name: "Test User",
        },
        callback: async (response) => {
          console.log("Flutterwave response:", response);

          if (response?.status === "successful") {
            if (typeof window.closePaymentModal === "function") {
              window.closePaymentModal();
            }
            console.log("onSuccess (client):", {
              tx_ref: response?.tx_ref || txRef,
              transaction_id: response?.transaction_id,
              amount: amountNumber,
            });

            // 🔒 verify/credit via your backend
            try {
              await postTopupToBackend({
                amountNumber,
                transactionId: response?.transaction_id,
              });
            } catch (err) {
              console.error(
                "❌ Backend verify/credit failed:",
                err?.response?.data || err?.message || err
              );
            }
          }

          setShowDialog(false);
          setLoading(false);
        },
        onclose: function () {
          console.log("Flutterwave modal closed");
          setLoading(false);
        },
        customizations: {
          title: "Wallet Top-Up",
          description: `Add funds to wallet (NGN ${amountNumber})`,
          logo: "https://yourdomain.com/logo.png",
        },
      });
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleDialogContinue = () => {
    const amount = Number(String(amountInput).replace(/[^\d.]/g, ""));
    if (!amount || amount <= 0) return;
    startPayment(amount);
  };

  return (
    <div className="bg-[#273e8e] rounded-[16px] px-4 pt-4 pb-3 text-white shadow-md">
      {/* Header: Label & Icon */}
      <div className="flex justify-between items-center mb-2">
        <p className="text-white/70 text-sm">Shopping Wallet</p>
        <div className="bg-[#1d3073] h-7 w-7 rounded-md flex items-center justify-center">
          {showAmount ? (
            <Eye
              onClick={() => setShowAmount(false)}
              size={18}
              className="text-white/70 cursor-pointer"
              title="Hide balance"
            />
          ) : (
            <EyeOff
              onClick={() => setShowAmount(true)}
              size={18}
              className="text-white/70 cursor-pointer"
              title="Show balance"
            />
          )}
        </div>
      </div>

      {/* Balance */}
      <h1 className="text-xl font-bold -tracking-tighter mb-2">
        {walletLoading ? "Loading..." : (showAmount ? `₦${Number(balance || 0).toLocaleString()}` : "******")}
      </h1>

      <div className="flex  min-h-[70px] flex-row justify-between items-start sm:items-center bg-[#1d3073] py-3 px-3 rounded-md gap-3">
        {/* Loan Info */}
        <div className="flex flex-col gap-2 text-sm leading-tight">
          <p className="text-white/80 text-xs">Last Transaction</p>
          <p className="text-white">{walletLoading ? "Loading..." : (showAmount ? `₦${Number(lastTransaction || 0).toLocaleString()}` : "******")}</p>
        </div>
        <div className="h-10 w-10 bg-white flex justify-center  items-center rounded-full">
          <img src={assets.greenTick} className="h-4 w-4 rotate-12" alt="" />
        </div>
      </div>

      {/* CTA Button */}
      <button
        onClick={() => setShowDialog(true)}
        className="bg-white text-[#000]  text-[12px] rounded-full py-3 mt-2 w-full cursor-pointer"
      >
        Fund Wallet
      </button>

      {/* Amount Dialog (keeps card UI intact; dialog overlays without changing card styles) */}
      {showDialog && (
        <>
          {/* overlay */}
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => !loading && setShowDialog(false)}
          />
          {/* centered modal */}
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-sm font-semibold text-gray-800">
                  Add Funds to Wallet
                </h3>
                <button
                  className="p-2 rounded-md hover:bg-gray-100"
                  onClick={() => !loading && setShowDialog(false)}
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                <label className="text-xs text-gray-600">Amount (NGN)</label>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full rounded-md border text-black border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#273e8e] focus:border-[#273e8e]"
                  placeholder="e.g. 1000"
                  disabled={loading}
                />

                <p className="text-[11px] text-gray-500">
                  A test payment will open in Flutterwave’s modal. We’ll then send{" "}
                  <code>{`{ amount, txId }`}</code> to your backend and log the response.
                </p>
              </div>

              <div className="p-4 pt-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowDialog(false)}
                  className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDialogContinue}
                  className="px-4 py-2 rounded-md bg-[#273e8e] text-white text-sm hover:bg-[#1d2f6b] disabled:opacity-60"
                  disabled={loading}
                >
                  {loading ? "Opening…" : "Continue"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ShoppingWallet;
