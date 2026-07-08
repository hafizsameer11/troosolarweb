import axios from "axios";
import API from "../config/api.config";

export const BNPL_MIN_FALLBACK = 1_500_000;

export const BNPL_PROMO_COPY =
  "Don't have the finances to proceed? Apply for Buy Now, Pay Later (BNPL).";

export const BNPL_BUTTON_LABEL = "Buy Now, Pay Later";

/** @returns {Promise<number>} */
export async function fetchBnplMinimumLoanAmount(token) {
  try {
    const res = await axios.get(API.CONFIG_LOAN_CONFIGURATION, {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    const m = res?.data?.data?.minimum_loan_amount;
    if (m != null && Number(m) > 0) return Number(m);
  } catch {
    /* ignore */
  }
  return BNPL_MIN_FALLBACK;
}

export function isBnplEligiblePrice(amount, minimum = BNPL_MIN_FALLBACK) {
  const price = Number(amount);
  const min = Number(minimum);
  if (!Number.isFinite(price) || price <= 0) return false;
  if (!Number.isFinite(min) || min <= 0) return true;
  return price >= min;
}
