import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * Choose financing option after Review Loan Plan and before Final Application form.
 * Options come from Admin Settings → Financing Partner (Active only, including Troosolar).
 */
const BnplFinancingPathStep = ({
  formData,
  setFormData,
  financingPartners = [],
  loadingPartners = false,
  onBack,
  onContinue,
}) => {
  const set = (patch) => setFormData((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    if (!financingPartners.length) return;
    const selected = financingPartners.find((p) => Number(p.id) === Number(formData.financingPartnerId));
    if (selected) return;
    const troo = financingPartners.find((p) => p.is_troosolar || String(p.slug || '').toLowerCase() === 'troosolar');
    const fallback = troo || financingPartners[0];
    if (fallback) {
      set({
        financingPartnerId: Number(fallback.id),
        financingPath: (fallback.is_troosolar || String(fallback.slug || '').toLowerCase() === 'troosolar')
          ? 'troosolar'
          : 'partner',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financingPartners]);

  const handleContinue = () => {
    if (!formData.financingPartnerId) {
      alert('Please select a financing option to continue.');
      return;
    }
    onContinue();
  };

  return (
    <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
      <button type="button" onClick={onBack} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
        <ArrowLeft size={16} className="mr-2" /> Back
      </button>
      <h2 className="text-2xl font-bold mb-2 text-[#273e8e]">Financing Path</h2>
      <p className="text-sm text-gray-600 mb-6">
        Choose how you want to finance this order before completing the Final Application.
        Only options activated in Settings are listed. Partner financiers return a decision in 24–72 hours
        after credit-check payment; Troosolar continues the full BNPL process flow.
      </p>

      {loadingPartners ? (
        <p className="text-sm text-gray-500 mb-6">Loading financing options…</p>
      ) : financingPartners.length === 0 ? (
        <p className="text-sm text-amber-700 mb-6">
          No financing options are currently active. Please ask support to activate Troosolar or a partner under Settings → Financing Partner.
        </p>
      ) : (
        <div className="space-y-3 mb-8">
          {financingPartners.map((p) => {
            const isTroo = !!(p.is_troosolar || String(p.slug || '').toLowerCase() === 'troosolar');
            const selected = Number(formData.financingPartnerId) === Number(p.id);
            return (
              <label
                key={p.id}
                className={`flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer ${selected ? 'border-[#273e8e] bg-blue-50' : 'border-gray-200'}`}
              >
                <input
                  type="radio"
                  name="financingPartnerId"
                  checked={selected}
                  onChange={() => set({
                    financingPartnerId: Number(p.id),
                    financingPath: isTroo ? 'troosolar' : 'partner',
                  })}
                  className="mt-1"
                />
                <div>
                  <p className="font-semibold text-gray-900">{p.name}</p>
                  <p className="text-sm text-gray-600">
                    {isTroo
                      ? "Continue with Troosolar's BNPL process (credit check, approval, guarantor flow)."
                      : "Partner financier — we'll get back to you within 24–72 hours after credit-check payment."}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={handleContinue}
        disabled={!formData.financingPartnerId || financingPartners.length === 0}
        className={`w-full py-4 rounded-xl font-bold transition-colors ${
          !formData.financingPartnerId || financingPartners.length === 0
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
        }`}
      >
        Continue to Final Application
      </button>
    </div>
  );
};

export default BnplFinancingPathStep;
