/** Strip [FEE:…] / [FEE] prefixes from invoice fee titles. */
export const stripInvoiceFeeTitle = (title) =>
  String(title || '')
    .replace(/^\[FEE:[^\]]*\]/i, '')
    .replace(/^\[FEE\]/i, '')
    .trim()
    .toLowerCase();

/**
 * Legacy site-wide defaults (₦50k / ₦25k / ₦10k) that were injected before admin fee config.
 * Hide these on customer invoices until amounts are set explicitly in Bundle Mgt.
 */
export const isLegacyDefaultInvoiceFee = (description, rate) => {
  const name = stripInvoiceFeeTitle(description);
  const amount = Number(rate) || 0;
  if ((name === 'installation fees' || name === 'installation fee') && amount === 50000) return true;
  if ((name === 'delivery fees' || name === 'delivery fee') && amount === 25000) return true;
  if ((name === 'inspection fees' || name === 'inspection fee') && amount === 10000) return true;
  return false;
};

export const filterBillableInvoiceFees = (rows) =>
  (rows || []).filter(
    (r) => Number(r.rate) > 0 && !isLegacyDefaultInvoiceFee(r.description, r.rate)
  );

/**
 * Map one admin invoice-fee row to a single category.
 * Material is checked before installation so "Installation Material Fee" is material only.
 */
export const classifyInvoiceFeeKind = (description) => {
  const name = stripInvoiceFeeTitle(description);
  if (!name) return null;
  if (name.includes('delivery')) return 'delivery';
  if (name.includes('inspection')) return 'inspection';
  if (name.includes('material')) return 'material';
  if (name.includes('installation')) return 'installation';
  return null;
};
