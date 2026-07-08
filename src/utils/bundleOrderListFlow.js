/**
 * Bundle custom_services are scoped per checkout flow (buy_now vs bnpl).
 * Legacy rows without flow_type are treated as buy_now.
 */

export const BUNDLE_CHECKOUT_FLOWS = {
  BUY_NOW: 'buy_now',
  BNPL: 'bnpl',
};

export function resolveCustomServiceFlowType(service) {
  return service?.flow_type === BUNDLE_CHECKOUT_FLOWS.BNPL
    ? BUNDLE_CHECKOUT_FLOWS.BNPL
    : BUNDLE_CHECKOUT_FLOWS.BUY_NOW;
}

export function filterBundleCustomServicesByFlow(services, checkoutFlow) {
  const flow = checkoutFlow === BUNDLE_CHECKOUT_FLOWS.BNPL
    ? BUNDLE_CHECKOUT_FLOWS.BNPL
    : BUNDLE_CHECKOUT_FLOWS.BUY_NOW;

  const all = services || [];
  const scoped = all.filter((svc) => resolveCustomServiceFlowType(svc) === flow);

  // Legacy bundles: use buy_now rows for BNPL until a BNPL-specific list is saved.
  if (flow === BUNDLE_CHECKOUT_FLOWS.BNPL && scoped.length === 0) {
    return all.filter((svc) => resolveCustomServiceFlowType(svc) === BUNDLE_CHECKOUT_FLOWS.BUY_NOW);
  }

  return scoped;
}
