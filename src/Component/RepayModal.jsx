// src/Component/RepayModal.jsx
import React, { useState } from "react";
import { X } from "lucide-react";
import axios from "axios";
import API, { FLUTTERWAVE_PUBLIC_KEY } from "../config/api.config";

/* ---------------- Load Flutterwave Script ---------------- */
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

const RepayModal = ({ id, isOpen, onClose }) => {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setAmount("");
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;

    try {
      setLoading(true);
      await ensureFlutterwave();

      const outerTxRef = "txref_" + Date.now();

      window.FlutterwaveCheckout({
        public_key: FLUTTERWAVE_PUBLIC_KEY,
        tx_ref: outerTxRef,
        amount: n,
        currency: "NGN",
        payment_options: "card,ussd",
        customer: {
          email: "test@example.com", // TODO: inject real user email
          name: "Test User", // TODO: inject real user name
        },
        callback: async function (response) {
          console.log("Flutterwave response:", response);

          // Normalize Flutterwave fields safely
          const fwRef =
            response?.tx_ref || response?.txRef || response?.flw_ref || outerTxRef;
          const txIdRaw =
            response?.transaction_id ??
            response?.id ??
            response?.data?.id ??
            response?.transaction?.id ??
            "";
          const txId = String(txIdRaw || ""); // enforce string

          if (response?.status === "successful") {
            if (typeof window.closePaymentModal === "function") {
              window.closePaymentModal();
            }
            try {
              const token = localStorage.getItem("access_token");
              if (!token) {
                alert("Session expired. Please log in again.");
                setLoading(false);
                return;
              }

              const payload = {
                method: "card",     // wallet | bank | card | transfer
                tx_id: txId,        // required for non-wallet
                reference: fwRef,   // pass whatever FW gives
                title: "Flutterwave repayment",
                // amount: n,       // uncomment only if backend expects override
              };

              const res = await axios.post(API.Loan_Payment_Repay(id), payload, {
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                validateStatus: () => true, // let us inspect 4xx
              });

              if (res.status >= 200 && res.status < 300) {
                alert("Repayment successful!");
                handleClose();
              } else {
                const msg =
                  res?.data?.message ||
                  (res?.data?.errors &&
                    Object.values(res.data.errors).flat().join("\n")) ||
                  "Failed to record repayment.";
                console.error("Repay error:", res.status, res.data);
                alert(msg);
              }
            } catch (err) {
              console.error("Backend repayment failed:", err);
              alert(
                err?.response?.data?.message ||
                  (err?.response?.data?.errors &&
                    Object.values(err.response.data.errors).flat().join("\n")) ||
                  "Payment succeeded but failed to record repayment."
              );
            } finally {
              setLoading(false);
            }
          } else {
            alert("Payment was not completed.");
            setLoading(false);
          }
        }, // <-- ✅ comma added here to fix the syntax error

        onclose: function () {
          console.log("Flutterwave modal closed");
          setLoading(false);
        },
        customizations: {
          title: "Loan Repayment",
          description: `Installment ID: ${id}`,
          logo: "https://yourdomain.com/logo.png", // TODO: replace
        },
      });
    } catch (err) {
      console.error("Payment init failed:", err);
      alert("Could not initialize payment.");
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            Repay Installment
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Amount Input */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="amount"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Amount
            </label>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#273e8e] focus:border-transparent outline-none"
              min="0"
              step="0.01"
              required
            />
          </div>

          {/* Proceed Button */}
          <button
            type="submit"
            disabled={loading || !amount || Number(amount) <= 0}
            className="w-full py-3 px-6 bg-[#273e8e] text-white font-medium rounded-full hover:bg-[#1e2f6b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Processing..." : "Proceed to Pay"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RepayModal;
