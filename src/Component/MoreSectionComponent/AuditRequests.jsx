import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ClipboardList,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import API from "../../config/api.config";

const ITEMS_PER_PAGE = 10;

const formatWhen = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Human-readable audit category: Home and Office are standalone; commercial is Commercial / Industrial. */
const labelAuditType = (row) => {
  if (row.audit_type === "commercial") return "Commercial / Industrial";
  if (row.audit_type === "home-office") {
    if (row.audit_subtype === "office") return "Office";
    if (row.audit_subtype === "home") return "Home";
    return "Home";
  }
  return row.audit_type || "—";
};

const labelCustomerType = (value) => {
  const v = String(value || "").toLowerCase().trim();
  if (!v) return null;
  if (v === "residential") return "Residential";
  if (v === "sme") return "SME";
  if (v === "commercial") return "Commercial";
  return String(value);
};

const labelAuditRequestChoice = (row) => {
  const customerType = labelCustomerType(row?.customer_type);
  const auditTarget = labelAuditType(row);
  if (customerType && auditTarget && auditTarget !== "—") {
    return `${customerType} / ${auditTarget}`;
  }
  return customerType || auditTarget || "—";
};

const labelProductCategory = (value) => {
  const v = String(value || "").toLowerCase().trim();
  if (!v) return null;
  if (v === "full-kit") return "Solar panels, inverter, and battery solution";
  if (v === "inverter-battery") return "Inverter and battery solution";
  if (v === "battery-only") return "Battery only";
  if (v === "inverter-only") return "Inverter only";
  if (v === "panels-only") return "Solar panels only";
  if (v === "audit") return "Professional energy audit";
  return String(value).replace(/-/g, " ");
};

const statusStyle = (s) => {
  const v = String(s || "").toLowerCase();
  if (v === "approved") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (v === "rejected") return "bg-red-100 text-red-800 border-red-200";
  if (v === "completed") return "bg-blue-100 text-blue-800 border-blue-200";
  if (v === "pending") return "bg-amber-100 text-amber-900 border-amber-200";
  return "bg-gray-100 text-gray-800 border-gray-200";
};

const sourceLabel = (src) => {
  if (src === "buy_now") return "Buy Now";
  if (src === "bnpl") return "BNPL";
  return src || "—";
};

const formatNaira = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
};

const formatPaymentDate = (isoDate) => {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate}T12:00:00`);
  if (isNaN(d.getTime())) return String(isoDate);
  return d.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatPaymentTime = (time24) => {
  if (!time24) return "—";
  const [h, m] = String(time24).split(":");
  const hour = Number(h);
  const minute = Number(m);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return String(time24);
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
};

const hasAuditApprovalDetails = (row) =>
  row?.approval_payment_date ||
  row?.approval_payment_time ||
  row?.approval_payment_amount != null ||
  row?.approval_payment_account_details;


const pageNumberWindow = (currentPage, totalPages, maxButtons = 5) => {
  if (totalPages <= maxButtons) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let end = Math.min(totalPages, start + maxButtons - 1);
  start = Math.max(1, end - maxButtons + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};

const AuditRequests = () => {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("auditRequestId");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) {
        setErr("Please log in to see your audit requests.");
        setItems([]);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setErr("");
        const { data } = await axios.get(API.AUDIT_REQUESTS, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const list = Array.isArray(data?.data) ? data.data : [];
        if (mounted) setItems(list);
      } catch (e) {
        if (mounted) {
          setErr(
            e?.response?.data?.message ||
              e?.message ||
              "Failed to load audit requests."
          );
          setItems([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return tb - ta;
    });
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sorted.slice(start, start + ITEMS_PER_PAGE);
  }, [sorted, currentPage]);

  useEffect(() => {
    if (!highlightId || !sorted.length) return;
    const id = String(highlightId);
    const idx = sorted.findIndex((r) => String(r.id) === id);
    if (idx < 0) return;
    const targetPage = Math.floor(idx / ITEMS_PER_PAGE) + 1;
    setCurrentPage(targetPage);
    setExpandedId(Number(id));
    setTimeout(() => {
      const el = document.getElementById(`audit-request-${id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }, [highlightId, sorted]);

  const handlePageChange = (next) => {
    if (next >= 1 && next <= totalPages) setCurrentPage(next);
  };

  if (!token) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center text-gray-600">
        Please log in to view your audit requests.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[#273e8e]/10 flex items-center justify-center shrink-0">
          <ClipboardList className="w-6 h-6 text-[#273e8e]" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Audit requests</h2>
          <p className="text-sm text-gray-600 mt-1">
            Every energy audit you submit from Buy Now or BNPL appears here with the latest status.
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-[#273e8e] gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-medium">Loading your requests…</span>
        </div>
      )}

      {!loading && err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {!loading && !err && sorted.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-600">
          You have not submitted any audit requests yet.
        </div>
      )}

      {!loading && !err && sorted.length > 0 && (
        <div className="space-y-3">
          {paginated.map((row) => {
            const id = row.id;
            const isOpen = expandedId === id;
            const isHi = highlightId && String(highlightId) === String(id);
            return (
              <div
                key={id}
                id={`audit-request-${id}`}
                className={`rounded-2xl border bg-white overflow-hidden transition-shadow ${
                  isHi
                    ? "border-[#273e8e] ring-2 ring-[#273e8e]/20 shadow-md"
                    : "border-gray-200 shadow-sm"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : id)}
                  className="w-full text-left px-4 py-4 flex items-start justify-between gap-3 hover:bg-gray-50/80"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">
                        Request #{id}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusStyle(
                          row.status
                        )}`}
                      >
                        {String(row.status || "pending")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 font-medium truncate">
                      {labelAuditRequestChoice(row)}
                      {row.company_name ? ` · ${row.company_name}` : ""}
                    </p>
                    {labelProductCategory(row.product_category) ? (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {labelProductCategory(row.product_category)}
                      </p>
                    ) : null}
                    <p className="text-xs text-gray-500 mt-1">
                      Submitted {formatWhen(row.created_at)} · Source:{" "}
                      {sourceLabel(row.source)}
                    </p>
                  </div>
                  <div className="shrink-0 text-gray-400 pt-1">
                    {isOpen ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-0 border-t border-gray-100 bg-gray-50/50">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm pt-4">
                      <div>
                        <dt className="text-gray-500">Location (state)</dt>
                        <dd className="font-medium text-gray-900">
                          {row.property_state || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Contact</dt>
                        <dd className="font-medium text-gray-900">
                          {row.contact_name || "—"}
                          {row.contact_phone ? ` · ${row.contact_phone}` : ""}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-gray-500">Address</dt>
                        <dd className="font-medium text-gray-900 whitespace-pre-wrap">
                          {row.property_address || "—"}
                        </dd>
                      </div>
                      {row.property_landmark ? (
                        <div className="sm:col-span-2">
                          <dt className="text-gray-500">Current power sources and capacity</dt>
                          <dd className="font-medium text-gray-900">
                            {row.property_landmark}
                          </dd>
                        </div>
                      ) : null}
                      {row.building_type ? (
                        <div>
                          <dt className="text-gray-500">Building type</dt>
                          <dd className="font-medium text-gray-900">
                            {row.building_type}
                          </dd>
                        </div>
                      ) : null}
                      {labelProductCategory(row.product_category) ? (
                        <div className="sm:col-span-2">
                          <dt className="text-gray-500">Solution</dt>
                          <dd className="font-medium text-gray-900">
                            {labelProductCategory(row.product_category)}
                          </dd>
                        </div>
                      ) : null}
                      {(row.property_floors != null || row.property_rooms != null) && (
                        <div>
                          <dt className="text-gray-500">
                            {row.audit_subtype === "office"
                              ? "No. of floors / No. of office spaces"
                              : "No. of floors / No. of rooms"}
                          </dt>
                          <dd className="font-medium text-gray-900">
                            {row.property_floors ?? "—"} / {row.property_rooms ?? "—"}
                          </dd>
                        </div>
                      )}
                      {row.audit_type !== "commercial" &&
                        row.is_gated_estate !== undefined &&
                        row.is_gated_estate !== null && (
                        <div>
                          <dt className="text-gray-500">Gated estate</dt>
                          <dd className="font-medium text-gray-900">
                            {row.is_gated_estate ? "Yes" : "No"}
                          </dd>
                        </div>
                      )}
                      {row.is_gated_estate && row.estate_name ? (
                        <div>
                          <dt className="text-gray-500">Estate name</dt>
                          <dd className="font-medium text-gray-900">{row.estate_name}</dd>
                        </div>
                      ) : null}
                      {row.is_gated_estate && row.estate_address ? (
                        <div className="sm:col-span-2">
                          <dt className="text-gray-500">Estate address</dt>
                          <dd className="font-medium text-gray-900 whitespace-pre-wrap">
                            {row.estate_address}
                          </dd>
                        </div>
                      ) : null}
                      {row.facility_description ? (
                        <div className="sm:col-span-2">
                          <dt className="text-gray-500">Facility description</dt>
                          <dd className="font-medium text-gray-900 whitespace-pre-wrap">
                            {row.facility_description}
                          </dd>
                        </div>
                      ) : null}
                      {row.order_number ? (
                        <div>
                          <dt className="text-gray-500">Linked order</dt>
                          <dd className="font-medium text-gray-900">
                            #{row.order_number}
                          </dd>
                        </div>
                      ) : null}
                      {row.approved_at ? (
                        <div>
                          <dt className="text-gray-500">Approved at</dt>
                          <dd className="font-medium text-gray-900">
                            {formatWhen(row.approved_at)}
                          </dd>
                        </div>
                      ) : null}
                      {String(row.status || "").toLowerCase() === "approved" &&
                        hasAuditApprovalDetails(row) && (
                          <div className="sm:col-span-2 mt-2">
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 space-y-3">
                              <p className="text-sm font-semibold text-emerald-900">
                                Audit visit details and payment instructions
                              </p>
                              <p className="text-xs text-emerald-800">
                                Your audit has been approved. The details below show when the team will come for the audit and how to make payment before the visit.
                              </p>
                              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                <div>
                                  <dt className="text-emerald-700">Audit date</dt>
                                  <dd className="font-medium text-gray-900">
                                    {formatPaymentDate(row.approval_payment_date)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-emerald-700">Audit time</dt>
                                  <dd className="font-medium text-gray-900">
                                    {formatPaymentTime(row.approval_payment_time)}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-emerald-700">Amount</dt>
                                  <dd className="font-medium text-gray-900">
                                    {formatNaira(row.approval_payment_amount)}
                                  </dd>
                                </div>
                                <div className="sm:col-span-2">
                                  <dt className="text-emerald-700">Payment account details</dt>
                                  <dd className="font-medium text-gray-900 whitespace-pre-wrap">
                                    {row.approval_payment_account_details || "—"}
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          </div>
                        )}
                      {row.customer_has_paid ? (
                        <div className="sm:col-span-2 mt-2">
                          <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4 space-y-2">
                            <p className="text-sm font-semibold text-blue-900">
                              Payment received
                            </p>
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                              <div>
                                <dt className="text-blue-700">Payment date</dt>
                                <dd className="font-medium text-gray-900">
                                  {formatPaymentDate(row.customer_payment_date)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-blue-700">Payment time</dt>
                                <dd className="font-medium text-gray-900">
                                  {formatPaymentTime(row.customer_payment_time)}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        </div>
                      ) : null}
                      {row.admin_notes ? (
                        <div className="sm:col-span-2">
                          <dt className="text-gray-500">Notes from team</dt>
                          <dd className="font-medium text-gray-900 whitespace-pre-wrap">
                            {row.admin_notes}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && !err && sorted.length > 0 && (
        <div className="pt-2 space-y-3">
          {totalPages > 1 && (
            <div className="flex flex-wrap justify-center items-center gap-2">
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 bg-white"
                aria-label="Previous page"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="flex flex-wrap gap-1 justify-center">
                {pageNumberWindow(currentPage, totalPages).map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => handlePageChange(pageNum)}
                    className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === pageNum
                        ? "bg-[#273e8e] text-white"
                        : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 bg-white"
                aria-label="Next page"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}

          <p className="text-center text-sm text-gray-500">
            Showing{" "}
            <span className="font-medium text-gray-700">
              {sorted.length === 0
                ? 0
                : (currentPage - 1) * ITEMS_PER_PAGE + 1}
              –
              {Math.min(currentPage * ITEMS_PER_PAGE, sorted.length)}
            </span>{" "}
            of <span className="font-medium text-gray-700">{sorted.length}</span>{" "}
            request{sorted.length !== 1 ? "s" : ""}
            {totalPages > 1 && (
              <span className="text-gray-400"> · Page {currentPage} of {totalPages}</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
};

export default AuditRequests;
