import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';

const DEFAULT_COPY = {
  title: 'Financing Path',
  intro:
    'Choose how you want to finance this order before completing the Final Application. Partner financiers return a decision in 24–72 hours after credit-check payment; Troosolar continues the full BNPL process flow.',
  back_label: 'Back',
  troosolar_title: 'Troosolar',
  troosolar_description:
    "Continue with Troosolar's BNPL process (credit check, approval, guarantor flow).",
  partner_title: 'Partner Financing',
  partner_description:
    "Partner financier — we'll get back to you within 24–72 hours after credit-check payment.",
  continue_troosolar_label: 'Continue to Full Loan Plan',
  continue_partner_label: 'Continue to Final Application',
};

/**
 * Exactly two options: Troosolar vs Partner Financing.
 * Every visible string comes from Admin → BNPL → Loan Settings.
 */
const BnplFinancingPathStep = ({
  formData,
  setFormData,
  pathCopy,
  onBack,
  onContinue,
}) => {
  const set = (patch) => setFormData((prev) => ({ ...prev, ...patch }));
  const copy = { ...DEFAULT_COPY, ...(pathCopy || {}) };

  useEffect(() => {
    if (formData.financingPath === 'partner' || formData.financingPath === 'troosolar') return;
    set({
      financingPath: 'troosolar',
      financingPartnerId: null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContinue = () => {
    if (formData.financingPath !== 'partner' && formData.financingPath !== 'troosolar') {
      alert('Please select a financing option to continue.');
      return;
    }
    onContinue(formData.financingPath);
  };

  const options = [
    {
      key: 'troosolar',
      title: copy.troosolar_title,
      description: copy.troosolar_description,
    },
    {
      key: 'partner',
      title: copy.partner_title,
      description: copy.partner_description,
    },
  ];

  const selected = formData.financingPath === 'partner' ? 'partner' : 'troosolar';
  const continueLabel =
    selected === 'partner' ? copy.continue_partner_label : copy.continue_troosolar_label;

  return (
    <div className="animate-fade-in max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
      <button type="button" onClick={onBack} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
        <ArrowLeft size={16} className="mr-2" /> {copy.back_label}
      </button>
      <h2 className="text-2xl font-bold mb-2 text-[#273e8e]">{copy.title}</h2>
      <p className="text-sm text-gray-600 mb-6 whitespace-pre-line">{copy.intro}</p>

      <div className="space-y-3 mb-8">
        {options.map((opt) => {
          const isSelected = selected === opt.key;
          return (
            <label
              key={opt.key}
              className={`flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer ${isSelected ? 'border-[#273e8e] bg-blue-50' : 'border-gray-200'}`}
            >
              <input
                type="radio"
                name="financingPath"
                checked={isSelected}
                onChange={() =>
                  set({
                    financingPath: opt.key,
                    financingPartnerId: null,
                  })
                }
                className="mt-1"
              />
              <div>
                <p className="font-semibold text-gray-900">{opt.title}</p>
                <p className="text-sm text-gray-600 whitespace-pre-line">{opt.description}</p>
              </div>
            </label>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleContinue}
        className="w-full py-4 rounded-xl font-bold transition-colors bg-[#273e8e] text-white hover:bg-[#1a2b6b]"
      >
        {continueLabel}
      </button>
    </div>
  );
};

export default BnplFinancingPathStep;
