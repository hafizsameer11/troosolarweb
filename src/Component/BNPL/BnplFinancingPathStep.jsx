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
  troosolar_enabled: true,
  partner_enabled: true,
  unavailable_label: 'Currently unavailable',
};

/**
 * Exactly two options: Troosolar vs Partner Financing.
 * Disabled options stay visible but cannot be selected (admin toggle).
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
  const troosolarEnabled = copy.troosolar_enabled !== false;
  const partnerEnabled = copy.partner_enabled !== false;

  useEffect(() => {
    const current = formData.financingPath;
    const currentOk =
      (current === 'troosolar' && troosolarEnabled) ||
      (current === 'partner' && partnerEnabled);

    if (currentOk) return;

    if (troosolarEnabled) {
      set({ financingPath: 'troosolar', financingPartnerId: null });
    } else if (partnerEnabled) {
      set({ financingPath: 'partner', financingPartnerId: null });
    } else {
      set({ financingPath: null, financingPartnerId: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [troosolarEnabled, partnerEnabled]);

  const handleContinue = () => {
    const path = formData.financingPath;
    if (path === 'troosolar' && !troosolarEnabled) {
      alert(`${copy.troosolar_title} is currently unavailable. Please choose another option.`);
      return;
    }
    if (path === 'partner' && !partnerEnabled) {
      alert(`${copy.partner_title} is currently unavailable. Please choose another option.`);
      return;
    }
    if (path !== 'partner' && path !== 'troosolar') {
      alert('Please select a financing option to continue.');
      return;
    }
    onContinue(path);
  };

  const options = [
    {
      key: 'troosolar',
      title: copy.troosolar_title,
      description: copy.troosolar_description,
      enabled: troosolarEnabled,
    },
    {
      key: 'partner',
      title: copy.partner_title,
      description: copy.partner_description,
      enabled: partnerEnabled,
    },
  ];

  const selected =
    formData.financingPath === 'partner'
      ? 'partner'
      : formData.financingPath === 'troosolar'
        ? 'troosolar'
        : null;
  const selectedEnabled =
    (selected === 'troosolar' && troosolarEnabled) ||
    (selected === 'partner' && partnerEnabled);
  const continueLabel =
    selected === 'partner' ? copy.continue_partner_label : copy.continue_troosolar_label;
  const canContinue = !!selectedEnabled;

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
          const disabled = !opt.enabled;
          return (
            <label
              key={opt.key}
              className={`flex items-start gap-3 p-4 border-2 rounded-xl ${
                disabled
                  ? 'border-gray-200 bg-gray-50 opacity-70 cursor-not-allowed'
                  : isSelected
                    ? 'border-[#273e8e] bg-blue-50 cursor-pointer'
                    : 'border-gray-200 cursor-pointer'
              }`}
            >
              <input
                type="radio"
                name="financingPath"
                checked={isSelected}
                disabled={disabled}
                onChange={() => {
                  if (disabled) return;
                  set({
                    financingPath: opt.key,
                    financingPartnerId: null,
                  });
                }}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`font-semibold ${disabled ? 'text-gray-500' : 'text-gray-900'}`}>{opt.title}</p>
                  {disabled && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                      {copy.unavailable_label}
                    </span>
                  )}
                </div>
                <p className={`text-sm whitespace-pre-line ${disabled ? 'text-gray-400' : 'text-gray-600'}`}>
                  {opt.description}
                </p>
              </div>
            </label>
          );
        })}
      </div>

      {!troosolarEnabled && !partnerEnabled && (
        <p className="text-sm text-amber-700 mb-4">
          No financing options are available to select right now. Please contact support.
        </p>
      )}

      <button
        type="button"
        onClick={handleContinue}
        disabled={!canContinue}
        className={`w-full py-4 rounded-xl font-bold transition-colors ${
          canContinue
            ? 'bg-[#273e8e] text-white hover:bg-[#1a2b6b]'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        {continueLabel}
      </button>
    </div>
  );
};

export default BnplFinancingPathStep;
