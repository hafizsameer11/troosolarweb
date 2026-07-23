import React from 'react';

const formatInvoiceAmount = (value) =>
    Number(value || 0).toLocaleString('en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

const SummaryDivider = () => (
    <hr className="border-0 border-t border-gray-300 my-1" />
);

/**
 * Checkout / invoice payment breakdown — shared by Buy Now flow and order details.
 */
const PaymentSummaryCard = ({
    subTotalBeforeDiscount,
    effectiveOutrightDiscount,
    outrightDiscountPct,
    discountedSubTotal,
    deliveryFee,
    installationFee,
    materialCost,
    inspectionFee,
    totalAmount,
    vatAmount,
    vatPercent,
    insuranceAmount,
    insurancePercent = 0,
    grandTotal,
    showServiceFeeBreakdown = true,
    showInsurance = false,
    className = 'mb-6',
}) => {
    const amountRow = (label, amount, { prefix = '', emphasize = false, valueClass = '' } = {}) => (
        <div className={`flex justify-between items-center py-2.5 text-sm ${emphasize ? 'font-medium' : ''}`}>
            <span className="text-gray-700">{label}</span>
            <span className={`font-semibold tabular-nums ${valueClass || 'text-gray-900'}`}>
                {prefix}₦{formatInvoiceAmount(Math.abs(amount))}
            </span>
        </div>
    );

    const discountPctLabel = Math.round(Number(outrightDiscountPct) || 0);

    return (
        <div className={`bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm ${className}`}>
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Payment summary</h3>
            </div>
            <div className="px-4 py-2">
                {amountRow('Sub-Total', subTotalBeforeDiscount)}
                {effectiveOutrightDiscount > 0 && amountRow(
                    discountPctLabel > 0
                        ? `Discount (${discountPctLabel}%)`
                        : 'Discount',
                    effectiveOutrightDiscount,
                    { prefix: '-', valueClass: 'text-green-700' }
                )}
                {amountRow('Net Total', discountedSubTotal, { emphasize: true })}
                {showServiceFeeBreakdown && (
                    <>
                        <SummaryDivider />
                        {deliveryFee > 0 && amountRow('Delivery Fee', deliveryFee, { prefix: '+' })}
                        {installationFee > 0 && amountRow('Installation Fee', installationFee, { prefix: '+' })}
                        {inspectionFee > 0 && amountRow('Inspection Fee', inspectionFee, { prefix: '+' })}
                        {materialCost > 0 && amountRow('Installation Materials Cost', materialCost, { prefix: '+' })}
                    </>
                )}
                <SummaryDivider />
                {amountRow('Total Amount', totalAmount, { emphasize: true })}
                {amountRow(`VAT (${vatPercent}% of Total Amount)`, vatAmount, { prefix: '+' })}
                {(showInsurance || insuranceAmount > 0) && amountRow(
                    `Insurance Fee (${insurancePercent}% of Sub-Total)`,
                    insuranceAmount,
                    { prefix: '+' }
                )}
                <SummaryDivider />
                <div className="flex justify-between items-center py-3">
                    <span className="font-bold text-base uppercase text-[#273e8e] tracking-wide">Grand Total</span>
                    <span className="font-bold text-xl text-[#273e8e] tabular-nums">₦{formatInvoiceAmount(grandTotal)}</span>
                </div>
            </div>
        </div>
    );
};

export default PaymentSummaryCard;
