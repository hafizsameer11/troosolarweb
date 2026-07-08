import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { Calculator, ArrowRight, Download, Printer } from 'lucide-react';
import API from '../config/api.config';
import fullLogo from '../assets/FUll Logo-01.png';

const BRAND_SLOGAN = 'Bridging the gap in affordable solar power solutions';

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const LoanCalculator = ({
  totalAmount: totalAmountProp,
  /** Catalog/bundle price (order-list Sub-Total). Insurance is always 3% of this, not grand total. */
  bundlePrice: bundlePriceProp,
  onConfirm,
  loanConfig: loanConfigProp,
}) => {
  const isStandalone = totalAmountProp == null || totalAmountProp === undefined;
  /** BNPL embed uses invoice grand total (VAT-inclusive). Tools calculator uses net excl. VAT. */
  const amountIncludesVat = !isStandalone;
  const breakdownRef = useRef(null);

  const [loanConfig, setLoanConfig] = useState(loanConfigProp || null);
  const [configLoading, setConfigLoading] = useState(isStandalone);
  const [standaloneAmount, setStandaloneAmount] = useState('');
  const [touched, setTouched] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(fullLogo)
      .then((res) => res.blob())
      .then(blobToDataUrl)
      .then((dataUrl) => {
        if (!cancelled && typeof dataUrl === 'string') setLogoDataUrl(dataUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isStandalone || loanConfigProp) return;
    const fetchConfig = async () => {
      setConfigLoading(true);
      try {
        const res = await axios.get(API.CONFIG_LOAN_CONFIGURATION, { headers: { Accept: 'application/json' } });
        const data = res.data?.data ?? res.data;
        if (data && typeof data === 'object') {
          setLoanConfig(data);
        } else {
          setLoanConfig(null);
        }
      } catch {
        setLoanConfig(null);
      } finally {
        setConfigLoading(false);
      }
    };
    fetchConfig();
  }, [isStandalone, loanConfigProp]);

  const config = loanConfigProp || loanConfig;
  const minDepositPercent = config?.equity_contribution_min ?? 30;
  const maxDepositPercent = config?.equity_contribution_max ?? 80;
  const maxInterestRate = config?.interest_rate_max ?? 4;
  const minAmount = Number(config?.minimum_loan_amount) || 1500000;
  const allowedTenors = useMemo(() => (Array.isArray(config?.loan_durations) && config.loan_durations.length > 0
    ? config.loan_durations
    : [3, 6, 9, 12]), [config?.loan_durations]);
  const downPaymentOptions = useMemo(() => (Array.isArray(config?.down_payment_options) && config.down_payment_options.length > 0
    ? [...new Set(config.down_payment_options.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v >= 0 && v <= 100))].sort((a, b) => a - b)
    : [30, 40, 50, 60, 70, 80].filter((p) => p >= minDepositPercent && p <= maxDepositPercent)), [config?.down_payment_options, minDepositPercent, maxDepositPercent]);

  const [depositPercent, setDepositPercent] = useState(downPaymentOptions[0] ?? minDepositPercent);
  const [tenor, setTenor] = useState(allowedTenors.includes(12) ? 12 : allowedTenors[0] || 12);
  const [interestRate] = useState(maxInterestRate);
  const vatPercent = Number(config?.vat_percentage ?? 7.5);
  const insurancePercent = Number(config?.insurance_fee_percentage ?? 3);
  const managementPercent = Number(config?.management_fee_percentage ?? 1);
  const legalPercent = Number(config?.residual_fee_percentage ?? 1);

  const pricingInput = isStandalone
    ? Number(String(standaloneAmount).replace(/[^\d.]/g, '')) || 0
    : Number(totalAmountProp) || 0;

  const { netAmount, vatAmount, grandTotal } = useMemo(() => {
    const input = pricingInput;
    if (input <= 0) {
      return { netAmount: 0, vatAmount: 0, grandTotal: 0 };
    }
    if (amountIncludesVat) {
      // Invoice grand total already includes VAT — use as-is for all loan math.
      const grand = input;
      const net = vatPercent > 0 ? grand / (1 + vatPercent / 100) : grand;
      const vat = Math.max(grand - net, 0);
      return { netAmount: net, vatAmount: vat, grandTotal: grand };
    }
    const net = input;
    const vat = net * (vatPercent / 100);
    return { netAmount: net, vatAmount: vat, grandTotal: net + vat };
  }, [pricingInput, vatPercent, amountIncludesVat]);

  const depositAmount = (grandTotal * depositPercent) / 100;
  const principal = grandTotal - depositAmount;
  const catalogBundlePrice = Number(bundlePriceProp) > 0
    ? Number(bundlePriceProp)
    : (isStandalone ? netAmount : 0);
  const insuranceBase = catalogBundlePrice > 0
    ? catalogBundlePrice
    : (isStandalone ? netAmount : grandTotal);
  const insuranceFee = insuranceBase * (insurancePercent / 100);
  const managementFee = principal * (managementPercent / 100);
  const legalFee = principal * (legalPercent / 100);
  const administrativeFees = insuranceFee + managementFee + legalFee;
  const upfrontDue = depositAmount + administrativeFees;
  const totalInterest = principal * (interestRate / 100) * tenor;
  const totalRepayment = principal + totalInterest;
  const monthlyRepayment = tenor > 0 ? totalRepayment / tenor : 0;
  const isEligible = grandTotal >= minAmount;
  const showMinError = isStandalone && touched && pricingInput > 0 && grandTotal < minAmount;

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(val) || 0);
  };

  const formatPlain = (val) => formatCurrency(val).replace('NGN', '₦');

  useEffect(() => {
    if (Array.isArray(config?.loan_durations) && config.loan_durations.length > 0 && !allowedTenors.includes(tenor)) {
      setTenor(allowedTenors.includes(12) ? 12 : allowedTenors[0]);
    }
  }, [config?.loan_durations, allowedTenors, tenor]);

  useEffect(() => {
    if (downPaymentOptions.length === 0) return;
    if (!downPaymentOptions.includes(depositPercent)) {
      setDepositPercent(downPaymentOptions[0]);
    }
  }, [downPaymentOptions, depositPercent]);

  const buildSummaryRows = () => {
    if (!isStandalone) {
      return [
        { label: 'Total Amount', value: formatPlain(grandTotal) },
        { label: 'Initial Deposit', value: `−${formatPlain(depositAmount)}`, accent: 'red' },
        { label: 'Total Loan Amount', value: formatPlain(principal) },
        { label: `Total Interest Amount (${interestRate}% × ${tenor} mo)`, value: formatPlain(totalInterest), accent: 'orange' },
        { label: 'Total Repayment Amount', value: formatPlain(totalRepayment), bold: true },
        { label: `Monthly Repayment Amount (${tenor} months)`, value: formatPlain(monthlyRepayment), bold: true, highlight: true, hero: true },
      ];
    }
    return [
      { section: 'pricing' },
      { label: 'Product Amount (excl. VAT)', value: formatPlain(netAmount) },
      { label: `VAT (${vatPercent}%)`, value: formatPlain(vatAmount) },
      { label: 'Grand total (incl. VAT)', value: formatPlain(grandTotal), bold: true },
      { section: 'loan' },
      { label: `Initial deposit (${depositPercent}%)`, value: `−${formatPlain(depositAmount)}`, accent: 'red' },
      { label: 'Total loan amount', value: formatPlain(principal) },
      { label: 'Upfront Payment (Initial Deposit + Administrative Fees)', value: formatPlain(upfrontDue), bold: true, highlight: true },
      { section: 'repayment' },
      { label: `Total interest (${interestRate}% × ${tenor} mo)`, value: formatPlain(totalInterest) },
      { label: 'Total repayment amount', value: formatPlain(totalRepayment), bold: true },
      { label: `Monthly repayment (${tenor} months)`, value: formatPlain(monthlyRepayment), bold: true, highlight: true, hero: true },
      { section: 'fees' },
      { label: `Insurance fee (${insurancePercent}% of bundle price)`, value: formatPlain(insuranceFee) },
      { label: `Management fee (${managementPercent}% of loan amount)`, value: formatPlain(managementFee) },
      { label: `Legal fee (${legalPercent}% of loan amount)`, value: formatPlain(legalFee) },
      { label: 'Total administrative fees', value: formatPlain(administrativeFees), bold: true },
    ];
  };

  const downloadBlob = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const resolveLogoDataUrl = async () => {
    if (logoDataUrl) return logoDataUrl;
    try {
      const res = await fetch(fullLogo);
      const dataUrl = await blobToDataUrl(await res.blob());
      if (typeof dataUrl === 'string') {
        setLogoDataUrl(dataUrl);
        return dataUrl;
      }
    } catch {
      // fall through
    }
    return '';
  };

  const buildStyledSummaryHtml = (embeddedLogo = logoDataUrl) => {
    const rows = buildSummaryRows();
    const generatedAt = new Date().toLocaleString();
    const depositLabel = `${depositPercent}%`;
    const tenorLabel = `${tenor} months`;

    const tableRows = rows.map((r) => {
      if (r.section === 'fees') {
        return `<tr><td colspan="2" style="padding:16px 0 8px;border:none;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Administrative fees</div>
        </td></tr>`;
      }
      if (r.section) return '';
      if (r.hero) {
        return `<tr>
          <td colspan="2" style="padding:0;border:none;">
            <div style="background:#273e8e;color:#fff;border-radius:10px;padding:16px 20px;margin-top:12px;text-align:center;">
              <div style="font-size:12px;opacity:0.9;margin-bottom:4px;">Monthly repayment (${tenorLabel})</div>
              <div style="font-size:28px;font-weight:700;">${r.value}</div>
            </div>
          </td>
        </tr>`;
      }
      if (r.highlight) {
        return `<tr>
          <td colspan="2" style="padding:0;border:none;">
            <div style="background:#e8eefb;border:1px solid #c7d4f5;border-radius:8px;padding:12px 16px;margin:8px 0;display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:600;color:#273e8e;">${r.label}</span>
              <span style="font-weight:700;color:#273e8e;">${r.value}</span>
            </div>
          </td>
        </tr>`;
      }
      const valueColor = r.accent === 'red' ? '#dc2626' : r.accent === 'orange' ? '#ea580c' : '#111827';
      const fontWeight = r.bold ? '700' : '500';
      return `<tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:10px 0;color:#4b5563;font-size:14px;">${r.label}</td>
        <td style="padding:10px 0;text-align:right;color:${valueColor};font-weight:${fontWeight};font-size:14px;">${r.value}</td>
      </tr>`;
    }).join('');

    const brandHeader = embeddedLogo
      ? `<img src="${embeddedLogo}" alt="Troosolar — ${BRAND_SLOGAN}" class="brand-logo" />
        <p class="summary-title">Loan Calculator Summary</p>`
      : `<h1>Troosolar</h1>
        <p class="brand-slogan">${BRAND_SLOGAN}</p>
        <p class="summary-title">Loan Calculator Summary</p>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Troosolar Loan Summary</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #1f2937; background: #f3f4f6; margin: 0; padding: 24px; }
    .wrap { max-width: 640px; margin: 0 auto; }
    .card { background: #f5f7ff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 24px rgba(39,62,142,0.08); }
    .brand { background: #fff; color: #273e8e; text-align: center; padding: 28px 24px 22px; border-bottom: 4px solid #273e8e; }
    .brand-logo { max-width: 300px; width: 100%; height: auto; display: block; margin: 0 auto; }
    .brand h1 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 0.3px; color: #273e8e; }
    .brand-slogan { margin: 8px 0 0; font-size: 13px; color: #4b5563; line-height: 1.5; }
    .summary-title { margin: 14px 0 0; font-size: 15px; font-weight: 600; color: #273e8e; }
    .body { padding: 28px 28px 32px; }
    .meta { color: #6b7280; font-size: 13px; margin-bottom: 20px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 22px; }
    .chip { background: #fff; border: 1px solid #dbe3f8; color: #273e8e; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 999px; }
    table { width: 100%; border-collapse: collapse; }
    .footer { margin-top: 24px; padding-top: 18px; border-top: 1px solid #cbd5e1; font-size: 12px; color: #64748b; line-height: 1.6; }
    @media print { body { background: #fff; padding: 0; } .card { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="brand">
        ${brandHeader}
      </div>
      <div class="body">
        <p class="meta">Generated ${generatedAt}</p>
        <div class="chips">
          <span class="chip">Initial deposit: ${depositLabel}</span>
          <span class="chip">Tenor: ${tenorLabel}</span>
          <span class="chip">Interest: ${interestRate}% / month</span>
        </div>
        <table>${tableRows}</table>
        <p class="footer">
          Administrative fees are paid upfront with your initial deposit and are not added to the repayable loan principal.
          VAT is calculated at ${vatPercent}% on the product amount (excl. VAT). This estimate uses current Troosolar BNPL settings and is for planning only.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
  };

  const handleDownloadLoanSummary = async () => {
    if (grandTotal <= 0) return;
    const logo = await resolveLogoDataUrl();
    downloadBlob(buildStyledSummaryHtml(logo), `troosolar-loan-summary-${Date.now()}.html`, 'text/html;charset=utf-8');
  };

  const handlePrintSummary = async () => {
    if (grandTotal <= 0) return;
    const logo = await resolveLogoDataUrl();
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1000');
    if (!printWindow) return;
    printWindow.document.write(buildStyledSummaryHtml(logo));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (configLoading && isStandalone) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">
        <p className="text-gray-500">Loading calculator settings…</p>
      </div>
    );
  }

  if (!isStandalone && !isEligible) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <h3 className="text-red-700 font-bold text-lg mb-2">Order Value Too Low</h3>
        <p className="text-red-600 mb-4">
          Your order total ({formatCurrency(grandTotal)}) does not meet the minimum {formatCurrency(minAmount)} amount required for credit financing.
        </p>
        <p className="text-red-600">
          To qualify for Buy Now, Pay Later, please add more items to your cart. Thank you.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 md:p-8">
      <div className="flex items-center mb-6">
        <div className="bg-blue-100 p-3 rounded-full mr-4">
          <Calculator className="text-[#273e8e]" size={24} />
        </div>
        <h2 className="text-2xl font-bold text-[#273e8e]">Loan Calculator</h2>
      </div>

      {isStandalone && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product amount (₦, excl. VAT)
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="e.g. 3000000"
            value={standaloneAmount}
            onChange={(e) => setStandaloneAmount(e.target.value)}
            onBlur={() => setTouched(true)}
            className="w-full max-w-xs px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#273e8e] focus:border-[#273e8e] outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">
            Enter bundle + fees before VAT. VAT ({vatPercent}%) is added on top — e.g. ₦3,000,000 → VAT ₦{formatPlain(3000000 * (vatPercent / 100)).replace('₦', '')}.
          </p>
          {showMinError && (
            <p className="mt-2 text-sm text-red-600">
              Grand total (incl. VAT) must be at least {formatCurrency(minAmount)}
            </p>
          )}
        </div>
      )}

      {(!isStandalone || isEligible) && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Initial Deposit ({depositPercent}%)
                </label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {downPaymentOptions.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDepositPercent(p)}
                      className={`py-2 rounded-lg text-sm font-medium transition-colors ${depositPercent === p ? 'bg-[#273e8e] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
                <p className="text-[#273e8e] font-bold mt-2 text-lg">{formatCurrency(depositAmount)}</p>
              </div>

              {!isStandalone && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Interest Rate (% of loan amount)
                  </label>
                  <div className="inline-flex">
                    <span className="py-2 px-4 rounded-lg text-sm font-medium bg-[#273e8e] text-white">
                      {interestRate}%
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Loan Tenor ({tenor} months)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {allowedTenors.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTenor(m)}
                      className={`py-2 rounded-lg text-sm font-medium transition-colors ${tenor === m ? 'bg-[#273e8e] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {m} Mo
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div ref={breakdownRef} className="bg-gray-50 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <h3 className="font-bold text-gray-800">Loan Breakdown</h3>
                {grandTotal > 0 && isStandalone && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadLoanSummary}
                      className="inline-flex items-center gap-1.5 border border-[#273e8e] text-[#273e8e] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#273e8e]/5 transition-colors"
                    >
                      <Download size={14} />
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintSummary}
                      className="inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors"
                    >
                      <Printer size={14} />
                      Print
                    </button>
                  </div>
                )}
              </div>

              {!isStandalone ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Amount</span>
                    <span className="font-medium">{formatCurrency(grandTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-b border-gray-200 pb-2">
                    <span className="text-gray-500">Initial Deposit</span>
                    <span className="font-medium text-red-600">−{formatCurrency(depositAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-b border-gray-200 pb-2">
                    <span className="text-gray-500">Total Loan Amount</span>
                    <span className="font-medium">{formatCurrency(principal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Interest Amount ({interestRate}% × {tenor} mo)</span>
                    <span className="font-medium text-orange-600">{formatCurrency(totalInterest)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t">
                    <span className="text-gray-500">Total Repayment Amount</span>
                    <span className="font-bold">{formatCurrency(totalRepayment)}</span>
                  </div>
                  <div className="bg-[#273e8e] text-white p-4 rounded-lg mt-2">
                    <p className="text-xs opacity-80 mb-1">Monthly Repayment Amount ({tenor} months)</p>
                    <p className="text-2xl font-bold">{formatCurrency(monthlyRepayment)}</p>
                  </div>
                </>
              ) : (
                <>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Product Amount (excl. VAT)</span>
                <span className="font-medium">{formatCurrency(netAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">VAT ({vatPercent}%)</span>
                <span className="font-medium">{formatCurrency(vatAmount)}</span>
              </div>
              <div className="flex justify-between text-sm border-b border-gray-200 pb-2">
                <span className="text-gray-600 font-medium">Grand total (incl. VAT)</span>
                <span className="font-semibold">{formatCurrency(grandTotal)}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Initial deposit ({depositPercent}%)</span>
                <span className="font-medium text-red-600">−{formatCurrency(depositAmount)}</span>
              </div>
              <div className="flex justify-between text-sm border-b border-gray-200 pb-2">
                <span className="text-gray-500">Total loan amount</span>
                <span className="font-medium">{formatCurrency(principal)}</span>
              </div>

              <div className="bg-[#273e8e]/10 border border-[#273e8e]/20 rounded-lg p-3">
                <div className="flex justify-between text-sm font-semibold text-[#273e8e]">
                  <span>Upfront Payment (Initial Deposit + Administrative Fees)</span>
                  <span>{formatCurrency(upfrontDue)}</span>
                </div>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total interest ({interestRate}% × {tenor} mo)</span>
                <span className="font-medium">{formatCurrency(totalInterest)}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t">
                <span className="text-gray-500">Total repayment amount</span>
                <span className="font-bold">{formatCurrency(totalRepayment)}</span>
              </div>
              <div className="bg-[#273e8e] text-white p-4 rounded-lg mt-2">
                <p className="text-xs opacity-80 mb-1">Monthly repayment ({tenor} months)</p>
                <p className="text-2xl font-bold">{formatCurrency(monthlyRepayment)}</p>
              </div>

              <div className="pt-4 border-t border-gray-200 space-y-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Administrative fees</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Insurance ({insurancePercent}% of bundle price)</span>
                  <span className="font-medium">{formatCurrency(insuranceFee)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Management ({managementPercent}% of loan amount)</span>
                  <span className="font-medium">{formatCurrency(managementFee)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Legal ({legalPercent}% of loan amount)</span>
                  <span className="font-medium">{formatCurrency(legalFee)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-700">Total administrative fees</span>
                  <span>{formatCurrency(administrativeFees)}</span>
                </div>
              </div>
                </>
              )}
            </div>
          </div>

          {grandTotal > 0 && isStandalone && (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleDownloadLoanSummary}
                className="inline-flex items-center gap-2 bg-[#273e8e] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a2b6b] transition-colors"
              >
                <Download size={16} />
                Download Loan Summary
              </button>
              <button
                type="button"
                onClick={handlePrintSummary}
                className="inline-flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <Printer size={16} />
                Print
              </button>
            </div>
          )}

          {!isStandalone && onConfirm && (
            <div className="mt-8 pt-6 border-t flex justify-end">
              <button
                type="button"
                onClick={() => onConfirm({
                  totalAmount: grandTotal,
                  bundlePrice: catalogBundlePrice > 0 ? catalogBundlePrice : insuranceBase,
                  netAmount,
                  depositPercent,
                  depositAmount,
                  principal,
                  totalLoanAmount: principal,
                  interestRate,
                  totalInterestAmount: totalInterest,
                  totalRepaymentAmount: totalRepayment,
                  monthlyRepaymentAmount: monthlyRepayment,
                  vatPercent,
                  vatAmount,
                  amountExcludingVat: netAmount,
                  grandTotal,
                  insuranceFee,
                  managementFee,
                  legalFee,
                  totalAdministrativeFees: administrativeFees,
                  upfrontDue,
                  tenor,
                  monthlyRepayment,
                  totalRepayment,
                  totalInterest,
                })}
                className="bg-[#273e8e] text-white px-8 py-3 rounded-xl font-bold hover:bg-[#1a2b6b] transition-colors flex items-center"
              >
                Proceed with Plan <ArrowRight size={18} className="ml-2" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LoanCalculator;
