/**
 * Resolve delivery fee for Buy Now / BNPL flows.
 * Priority when no bundle/location fee: state override > category > global default.
 */
export const resolveFlowDeliveryFee = ({
    productCategory,
    categoryDeliveryFees = {},
    defaultDeliveryFee = 0,
    stateDeliveryFee = null,
} = {}) => {
    const stateFee = stateDeliveryFee != null ? Number(stateDeliveryFee) : null;
    if (stateFee != null && stateFee > 0) {
        return stateFee;
    }

    const key = String(productCategory || '').trim();
    if (key && categoryDeliveryFees && categoryDeliveryFees[key] != null) {
        return Number(categoryDeliveryFees[key]) || 0;
    }

    return Number(defaultDeliveryFee) || 0;
};
