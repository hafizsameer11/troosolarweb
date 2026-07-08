import { Eye, EyeOff } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import API from "../config/api.config";
import { loginPathWithReturn } from "../utils/authRedirect";

const LoanWallet = () => {
  const [showAmount, setShowAmount] = useState(true); // true => amount visible (eye open), false => hidden (eye closed)
  const location = useLocation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [balance, setBalance] = useState(0); // numeric
  const [hasActiveLoan, setHasActiveLoan] = useState(false);
  const [nextPaymentDate, setNextPaymentDate] = useState(null);
  const [nextPaymentAmount, setNextPaymentAmount] = useState(null);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0 });

  useEffect(() => {
    const fetchWallet = async () => {
      setErr("");
      setLoading(true);
      try {
        const token = localStorage.getItem("access_token");
        if (!token) {
          navigate(loginPathWithReturn(location.pathname + location.search));
          return;
        }

        const { data } = await axios.get(API.LOAN_WALLET, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        // ResponseHelper::success($data, 'Your loan Wallet')
        const raw = data?.data;
        // backend returns { 'Loan balance': number }
        const val =
          typeof raw === "object" && raw !== null ? raw["Loan balance"] : 0;

        setBalance(Number(val || 0));
      } catch (e) {
        const status = e?.response?.status;
        if (status === 401) {
          localStorage.removeItem("access_token");
          navigate(loginPathWithReturn(location.pathname + location.search), { replace: true });
          return;
        }
        if (status === 404) {
          // wallet not created yet; treat as zero
          setBalance(0);
        } else {
          setErr(
            e?.response?.data?.message || e?.message || "Failed to load wallet."
          );
        }
      } finally {
        setLoading(false);
      }
    };

    const checkActiveLoans = async () => {
      try {
        const token = localStorage.getItem("access_token");
        if (!token) return;

        // First, try to get installments with history (this gives us all upcoming payments)
        let allUpcomingPayments = [];
        let hasActive = false;

        try {
          const historyResponse = await axios.get(API.Loan_Payment_Relate, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          });

          if (historyResponse.data?.status === "success" && historyResponse.data.data) {
            const historyData = historyResponse.data.data;
            const currentMonth = historyData.current_month || [];
            const history = historyData.history || [];
            
            // Combine and filter for unpaid upcoming payments
            const allInstallments = [...currentMonth, ...history];
            const now = new Date();
            now.setHours(0, 0, 0, 0);

            allUpcomingPayments = allInstallments
              .filter((inst) => {
                const isPaid = inst.status === 'paid' || inst.payment_status === 'paid';
                const paymentDate = new Date(inst.payment_date || inst.due_date);
                paymentDate.setHours(0, 0, 0, 0);
                return !isPaid && paymentDate >= now;
              })
              .map((inst) => ({
                payment_date: inst.payment_date || inst.due_date,
                amount: inst.amount || inst.payment_amount,
              }));

            if (allUpcomingPayments.length > 0) {
              hasActive = true;
            }
          }
        } catch (historyErr) {
          console.log("Could not fetch installments with history:", historyErr);
        }

        // If no payments found from history, check orders and applications
        if (allUpcomingPayments.length === 0) {
          const [ordersRes, appsRes] = await Promise.allSettled([
            axios.get(API.BNPL_ORDERS, {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
              },
              params: { per_page: 20, page: 1 },
            }),
            axios.get(API.BNPL_APPLICATIONS, {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
              },
              params: { per_page: 20, page: 1 },
            }),
          ]);

          // Check orders
          if (ordersRes.status === "fulfilled" && ordersRes.value.data?.status === "success") {
            const orders = ordersRes.value.data.data?.data || ordersRes.value.data.data || [];
            
            for (const order of orders) {
              const status = order.order_status || order.status;
              const loanApp = order.loan_application;
              const isActive = (status === "approved" || loanApp?.status === "approved");

              if (isActive) {
                hasActive = true;

                // Try to get repayment schedule from order
                if (order.repayment_schedule && order.repayment_schedule.length > 0) {
                  const now = new Date();
                  now.setHours(0, 0, 0, 0);
                  
                  const unpaid = order.repayment_schedule
                    .filter(inst => {
                      const isPaid = inst.status === 'paid' || inst.payment_status === 'paid';
                      const paymentDate = new Date(inst.payment_date || inst.due_date);
                      paymentDate.setHours(0, 0, 0, 0);
                      return !isPaid && paymentDate >= now;
                    })
                    .map(inst => ({
                      payment_date: inst.payment_date || inst.due_date,
                      amount: inst.amount,
                    }));

                  allUpcomingPayments.push(...unpaid);
                } 
                // Try loan summary
                else if (order.loan_summary?.next_payment_date) {
                  const paymentDate = new Date(order.loan_summary.next_payment_date);
                  const now = new Date();
                  if (paymentDate >= now) {
                    allUpcomingPayments.push({
                      payment_date: order.loan_summary.next_payment_date,
                      amount: order.loan_summary.next_payment_amount,
                    });
                  }
                }
                // Try to fetch repayment schedule from application
                else if (loanApp?.id) {
                  try {
                    const scheduleResponse = await axios.get(API.BNPL_REPAYMENT_SCHEDULE(loanApp.id), {
                      headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/json",
                      },
                    });

                    if (scheduleResponse.data?.status === "success" && scheduleResponse.data.data) {
                      const schedule = scheduleResponse.data.data.installments || 
                                     scheduleResponse.data.data.schedule || 
                                     scheduleResponse.data.data || [];
                      
                      const now = new Date();
                      now.setHours(0, 0, 0, 0);

                      const unpaid = schedule
                        .filter(inst => {
                          const isPaid = inst.status === 'paid' || inst.payment_status === 'paid';
                          const paymentDate = new Date(inst.payment_date || inst.due_date);
                          paymentDate.setHours(0, 0, 0, 0);
                          return !isPaid && paymentDate >= now;
                        })
                        .map(inst => ({
                          payment_date: inst.payment_date || inst.due_date,
                          amount: inst.amount,
                        }));

                      allUpcomingPayments.push(...unpaid);
                    }
                  } catch (scheduleErr) {
                    console.log("Could not fetch repayment schedule:", scheduleErr);
                  }
                }
              }
            }
          }

          // Check applications if still no payments found
          if (allUpcomingPayments.length === 0 && appsRes.status === "fulfilled" && appsRes.value.data?.status === "success") {
            const apps = appsRes.value.data.data?.data || appsRes.value.data.data || [];
            
            for (const app of apps) {
              const status = app.status?.toLowerCase();
              const isActive = status === "approved" || 
                             status === "counter_offer" || 
                             (status === "pending" && app.down_payment_completed);

              if (isActive) {
                hasActive = true;
                
                // Try to fetch repayment schedule
                if (app.id) {
                  try {
                    const scheduleResponse = await axios.get(API.BNPL_REPAYMENT_SCHEDULE(app.id), {
                      headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/json",
                      },
                    });

                    if (scheduleResponse.data?.status === "success" && scheduleResponse.data.data) {
                      const schedule = scheduleResponse.data.data.installments || 
                                     scheduleResponse.data.data.schedule || 
                                     scheduleResponse.data.data || [];
                      
                      const now = new Date();
                      now.setHours(0, 0, 0, 0);

                      const unpaid = schedule
                        .filter(inst => {
                          const isPaid = inst.status === 'paid' || inst.payment_status === 'paid';
                          const paymentDate = new Date(inst.payment_date || inst.due_date);
                          paymentDate.setHours(0, 0, 0, 0);
                          return !isPaid && paymentDate >= now;
                        })
                        .map(inst => ({
                          payment_date: inst.payment_date || inst.due_date,
                          amount: inst.amount,
                        }));

                      allUpcomingPayments.push(...unpaid);
                    }
                  } catch (scheduleErr) {
                    console.log("Could not fetch repayment schedule for app:", scheduleErr);
                  }
                }
              }
            }
          }
        }

        // Find the nearest upcoming payment
        let nextPayment = null;
        let nextAmount = null;

        if (allUpcomingPayments.length > 0) {
          const now = new Date();
          const sorted = allUpcomingPayments
            .filter(p => {
              const paymentDate = new Date(p.payment_date);
              return paymentDate >= now;
            })
            .sort((a, b) => {
              const dateA = new Date(a.payment_date);
              const dateB = new Date(b.payment_date);
              return dateA - dateB;
            });

          if (sorted.length > 0) {
            nextPayment = sorted[0].payment_date;
            nextAmount = sorted[0].amount;
          }
        }

        setHasActiveLoan(hasActive);
        setNextPaymentDate(nextPayment);
        setNextPaymentAmount(nextAmount);
      } catch (error) {
        console.log("Error checking active loans:", error);
        setHasActiveLoan(false);
      }
    };

    fetchWallet();
    checkActiveLoans();
  }, [navigate]);

  // Update hasActiveLoan when balance changes
  useEffect(() => {
    if (balance > 0 && !hasActiveLoan) {
      setHasActiveLoan(true);
    }
  }, [balance, hasActiveLoan]);

  // Calculate countdown to next payment
  useEffect(() => {
    if (!nextPaymentDate) {
      setCountdown({ days: 0, hours: 0 });
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const nextPayment = new Date(nextPaymentDate);
      const diff = nextPayment - now;

      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0 });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

      setCountdown({ days, hours });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000 * 60 * 60); // Update every hour

    return () => clearInterval(interval);
  }, [nextPaymentDate]);

  const path = location.pathname.includes("loanDetails/loanDashboard");

  const displayBalance = useMemo(() => {
    const txt = `₦${Number(balance || 0).toLocaleString()}`;
    return showAmount ? txt : "******";
  }, [balance, showAmount]);

  return (
    <div className="bg-[#273e8e] rounded-[16px] px-4 pt-4 pb-3 text-white shadow-md">
      {/* Header: Label & Icon */}
      <div className="flex justify-between items-center mb-2">
        <p className="text-white/70 text-xs lg:text-sm">Loan Wallet</p>
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
      <h1 className="text-xl font-bold mb-2">
        {loading ? "Loading…" : displayBalance}
      </h1>

      {/* Loan Info + Countdown */}
      <div className="flex min-h-[70px] flex-row justify-between items-start sm:items-center bg-[#1d3073] py-3 px-3 rounded-md gap-3">
        <div className="flex flex-col text-sm leading-tight">
          <p className="text-white/80 text-xs">
            {err 
              ? "Unable to fetch wallet" 
              : hasActiveLoan || balance > 0
              ? nextPaymentDate 
                ? `Next payment: ${new Date(nextPaymentDate).toLocaleDateString('en-GB', { month: 'long', day: 'numeric' })}`
                : "Active loan"
              : "You have no loans"}
          </p>
          <p className="text-white">
            {nextPaymentAmount 
              ? `₦${Number(nextPaymentAmount).toLocaleString()}`
              : hasActiveLoan || balance > 0 
              ? "View details" 
              : "-"}
          </p>
        </div>

        <div className="flex items-center h-[20px] gap-4 lg:mt-0 mt-3">
          <div className="w-[50px] h-[50px] flex flex-col items-center justify-center border border-[#ccc] rounded-[12px] shadow-[0_2px_0_#ccc]">
            <p className="text-[20px] font-bold leading-none">
              {String(countdown.days).padStart(2, '0')}
            </p>
            <p className="text-xs">Days</p>
          </div>
          <div className="text-[24px] font-extrabold">:</div>
          <div className="w-[50px] h-[50px] flex flex-col items-center justify-center border border-[#ccc] rounded-[12px] shadow-[0_2px_0_#ccc]">
            <p className="text-[20px] font-bold leading-none">
              {String(countdown.hours).padStart(2, '0')}
            </p>
            <p className="text-xs">Hours</p>
          </div>
        </div>
      </div>

      {/* CTA Button */}
      <button
        onClick={() => {
          if (path) {
            navigate("/loan");
          } else if (hasActiveLoan) {
            navigate("/bnpl-loans");
          } else {
            navigate("/bnpl");
          }
        }}
        className="bg-white text-[#000] text-sm rounded-full py-3 mt-2 w-full cursor-pointer text-[12px] hover:bg-gray-100 transition-colors"
      >
        {path ? "Transfer to Wallet" : hasActiveLoan ? "Repay Loan" : "Apply for Loan"}
      </button>
    </div>
  );
};

export default LoanWallet;
