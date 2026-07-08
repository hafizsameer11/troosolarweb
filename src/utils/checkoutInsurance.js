/** Insurance % from Admin → Checkout settings (`GET /api/config/checkout-settings`). */
export function resolveCheckoutInsurancePercent(checkoutSettings, invoiceDetails = null) {
  const fromInvoice = Number(invoiceDetails?.insurance_fee_percentage);
  if (Number.isFinite(fromInvoice) && fromInvoice >= 0) {
    return fromInvoice;
  }
  const fromSettings = Number(checkoutSettings?.insurance_fee_percentage);
  if (Number.isFinite(fromSettings) && fromSettings >= 0) {
    return fromSettings;
  }
  return 0;
}

export function formatInsurancePercentLabel(percent) {
  const n = Number(percent);
  if (!Number.isFinite(n) || n < 0) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}
