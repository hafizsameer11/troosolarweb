import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, X, Camera } from 'lucide-react';
import {
  financeAgreementTextForType,
  ID_TYPE_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
} from '../../utils/bnplFinanceAgreement';

const fieldClass = 'p-3 border rounded-lg w-full';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

/**
 * BNPL Final Application — residential vs SME field sets + Finance Agreement.
 * Partner Financing also collects bank statement + live selfie on this form.
 */
const BnplFinalApplicationForm = ({
  formData,
  setFormData,
  states = [],
  onBack,
  onContinue,
  isValidSocialMediaIdentity,
  getSocialMediaVerificationUrl,
}) => {
  const isSme = String(formData.customerType || '').toLowerCase() === 'sme';
  const isPartnerPath = String(formData.financingPath || '').toLowerCase() === 'partner';
  const [showAgreement, setShowAgreement] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const cameraVideoRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const agreementText = financeAgreementTextForType(formData.customerType);

  const set = (patch) => setFormData((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    if (cameraStream && cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  useEffect(() => () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }
  }, [cameraStream]);

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  const startCamera = async () => {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      setCameraStream(stream);
    } catch {
      alert('Unable to access camera. You can upload a selfie image instead.');
    }
  };

  const captureLivePhoto = () => {
    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `live-selfie-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const previewUrl = canvas.toDataURL('image/jpeg');
      set({ livePhoto: file, livePhotoPreview: previewUrl });
      stopCamera();
    }, 'image/jpeg', 0.9);
  };

  const validate = () => {
    const requiredPersonal = [
      'fullName',
      'bankAccountNo',
      'bankName',
      'bvn',
      'phone',
      'email',
      'gender',
      'maritalStatus',
      'socialMedia',
      'idType',
      'idExpiryDate',
      'idNo',
    ];
    if (!isSme) {
      requiredPersonal.push('dateOfBirth', 'occupation', 'monthlyIncome');
    }
    for (const key of requiredPersonal) {
      if (!String(formData[key] || '').trim()) {
        alert('Please fill in all required personal details.');
        return false;
      }
    }
    if (!isValidSocialMediaIdentity(formData.socialMedia)) {
      alert('Please enter a verifiable social media identity (@handle or Instagram/Facebook profile link).');
      return false;
    }
    if (!formData.state || !String(formData.address || '').trim()) {
      alert('Please fill in installation state and address.');
      return false;
    }
    if (isSme && !formData.propertyStatus) {
      alert('Please select property status (Owned or Rented).');
      return false;
    }
    if (!isSme) {
      if (!String(formData.nextOfKinName || '').trim() || !String(formData.nextOfKinPhone || '').trim()) {
        alert('Please fill in next of kin name and phone.');
        return false;
      }
      if (!String(formData.employmentCompanyName || '').trim() || !String(formData.employmentCompanyAddress || '').trim() || !String(formData.employmentDuration || '').trim()) {
        alert('Please fill in employment details (company name, address, and duration).');
        return false;
      }
    } else {
      const bizRequired = [
        'businessName',
        'businessAddress',
        'businessRcBn',
        'businessBankAccountNo',
        'businessBankName',
        'annualTurnover',
        'avgMonthlyTurnover',
        'dateOfIncorporation',
        'businessOwnership',
        'officialEmail',
        'natureOfBusiness',
      ];
      for (const key of bizRequired) {
        if (!String(formData[key] || '').trim()) {
          alert('Please fill in all required business details.');
          return false;
        }
      }
    }
    if (isPartnerPath) {
      if (!formData.bankStatement) {
        alert('Please upload your bank statement (last 6 months) for partner financing.');
        return false;
      }
      if (!formData.livePhoto) {
        alert('Please upload or capture a live selfie for partner financing.');
        return false;
      }
    }
    if (!formData.financeAgreementAccepted) {
      alert('Please accept the Finance Agreement to continue.');
      return false;
    }
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onContinue();
  };

  const TickGroup = ({ name, options, value, onChange }) => (
    <div className="flex flex-wrap gap-3">
      {options.map((opt) => {
        const v = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        return (
          <label key={v} className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name={name}
              checked={value === v}
              onChange={() => onChange(v)}
              className="h-4 w-4 text-[#273e8e]"
            />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );

  return (
    <div className="animate-fade-in max-w-4xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
      <button type="button" onClick={onBack} className="mb-6 flex items-center text-gray-500 hover:text-[#273e8e]">
        <ArrowLeft size={16} className="mr-2" /> Back
      </button>
      <h2 className="text-2xl font-bold mb-2 text-[#273e8e]">Final Application</h2>
      <p className="text-sm text-gray-600 mb-6">
        {isSme ? 'SMEs Process Flow' : 'Residential / Individual Process Flow'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Personal / Owner details */}
        <section>
          <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">
            {isSme ? 'Business Owner / Director Details' : 'Personal Details'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Full Name *</label>
              <input className={fieldClass} value={formData.fullName || ''} onChange={(e) => set({ fullName: e.target.value })} required />
            </div>
            <div>
              <label className={labelClass}>Current Bank Account No *</label>
              <input className={fieldClass} value={formData.bankAccountNo || ''} onChange={(e) => set({ bankAccountNo: e.target.value })} required />
            </div>
            <div>
              <label className={labelClass}>Bank Name *</label>
              <input className={fieldClass} value={formData.bankName || ''} onChange={(e) => set({ bankName: e.target.value })} required />
            </div>
            <div>
              <label className={labelClass}>BVN *</label>
              <input className={fieldClass} value={formData.bvn || ''} onChange={(e) => set({ bvn: e.target.value })} required />
            </div>
            <div>
              <label className={labelClass}>Phone Number *</label>
              <input type="tel" className={fieldClass} value={formData.phone || ''} onChange={(e) => set({ phone: e.target.value })} required />
            </div>
            <div>
              <label className={labelClass}>Email *</label>
              <input type="email" className={fieldClass} value={formData.email || ''} onChange={(e) => set({ email: e.target.value })} required />
            </div>
            <div>
              <label className={labelClass}>Gender *</label>
              <select className={fieldClass} value={formData.gender || ''} onChange={(e) => set({ gender: e.target.value })} required>
                <option value="">Select gender</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            {!isSme && (
              <div>
                <label className={labelClass}>DOB (M/D/Y) *</label>
                <input type="date" className={fieldClass} value={formData.dateOfBirth || ''} onChange={(e) => set({ dateOfBirth: e.target.value })} required />
              </div>
            )}
            <div>
              <label className={labelClass}>Marital Status *</label>
              <select className={fieldClass} value={formData.maritalStatus || ''} onChange={(e) => set({ maritalStatus: e.target.value })} required>
                <option value="">Select status</option>
                {MARITAL_STATUS_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            {!isSme && (
              <>
                <div>
                  <label className={labelClass}>Occupation *</label>
                  <input className={fieldClass} value={formData.occupation || ''} onChange={(e) => set({ occupation: e.target.value })} required />
                </div>
                <div>
                  <label className={labelClass}>Monthly Income *</label>
                  <input type="number" min="0" className={fieldClass} value={formData.monthlyIncome || ''} onChange={(e) => set({ monthlyIncome: e.target.value })} required />
                </div>
              </>
            )}
            <div className="md:col-span-2">
              <label className={labelClass}>Social Media Handle *</label>
              <input className={fieldClass} value={formData.socialMedia || ''} onChange={(e) => set({ socialMedia: e.target.value })} required />
              <p className="text-xs text-gray-500 mt-1">e.g. Instagram @handle or Facebook/Instagram profile link</p>
              {isValidSocialMediaIdentity(formData.socialMedia) && (
                <a href={getSocialMediaVerificationUrl(formData.socialMedia)} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-[#273e8e] mt-1 underline">
                  Verify profile link
                </a>
              )}
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>ID Type *</label>
              <TickGroup
                name="idType"
                options={ID_TYPE_OPTIONS}
                value={formData.idType || ''}
                onChange={(v) => set({ idType: v })}
              />
            </div>
            <div>
              <label className={labelClass}>ID Expiry Date *</label>
              <input type="date" className={fieldClass} value={formData.idExpiryDate || ''} onChange={(e) => set({ idExpiryDate: e.target.value })} required />
            </div>
            <div>
              <label className={labelClass}>ID No *</label>
              <input className={fieldClass} value={formData.idNo || ''} onChange={(e) => set({ idNo: e.target.value })} required />
            </div>
          </div>
        </section>

        {!isSme && (
          <section>
            <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Next of Kin</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Full Name *</label>
                <input className={fieldClass} value={formData.nextOfKinName || ''} onChange={(e) => set({ nextOfKinName: e.target.value })} required />
              </div>
              <div>
                <label className={labelClass}>Phone Number *</label>
                <input type="tel" className={fieldClass} value={formData.nextOfKinPhone || ''} onChange={(e) => set({ nextOfKinPhone: e.target.value })} required />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Address</label>
                <input className={fieldClass} value={formData.nextOfKinAddress || ''} onChange={(e) => set({ nextOfKinAddress: e.target.value })} />
              </div>
            </div>
          </section>
        )}

        <section>
          <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Property Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {states.length > 0 ? (
              <div>
                <label className={labelClass}>State *</label>
                <select
                  className={fieldClass}
                  required
                  value={formData.stateId || ''}
                  onChange={(e) => {
                    const stateId = e.target.value ? Number(e.target.value) : null;
                    const selectedState = states.find((s) => s.id === stateId);
                    set({ state: selectedState?.name || '', stateId });
                  }}
                >
                  <option value="">Select State</option>
                  {states.filter((s) => s.is_active !== false).map((state) => (
                    <option key={state.id} value={state.id}>{state.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className={labelClass}>State *</label>
                <input className={fieldClass} value={formData.state || ''} onChange={(e) => set({ state: e.target.value })} required />
              </div>
            )}
            <div>
              <label className={labelClass}>Installation Address *</label>
              <input className={fieldClass} value={formData.address || ''} onChange={(e) => set({ address: e.target.value })} required />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Current Power Sources</label>
              <input
                className={fieldClass}
                placeholder="e.g. grid, diesel generator(kVA), inverter(kVA/kW)"
                value={formData.landmark || ''}
                onChange={(e) => set({ landmark: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Floors</label>
              <input type="number" min="0" className={fieldClass} value={formData.floors || ''} onChange={(e) => set({ floors: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Rooms</label>
              <input type="number" min="0" className={fieldClass} value={formData.rooms || ''} onChange={(e) => set({ rooms: e.target.value })} />
            </div>
            {isSme && (
              <div className="md:col-span-2">
                <label className={labelClass}>Property Status *</label>
                <TickGroup
                  name="propertyStatus"
                  options={PROPERTY_STATUS_OPTIONS}
                  value={formData.propertyStatus || ''}
                  onChange={(v) => set({ propertyStatus: v })}
                />
              </div>
            )}
          </div>
          {!isSme && (
            <div className="mt-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!formData.isGatedEstate}
                  onChange={(e) => set({ isGatedEstate: e.target.checked })}
                />
                Is this in a gated estate?
              </label>
              {formData.isGatedEstate && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  <input className={fieldClass} placeholder="Estate Name *" value={formData.estateName || ''} onChange={(e) => set({ estateName: e.target.value })} required />
                  <input className={fieldClass} placeholder="Estate Address *" value={formData.estateAddress || ''} onChange={(e) => set({ estateAddress: e.target.value })} required />
                </div>
              )}
            </div>
          )}
        </section>

        {!isSme ? (
          <section>
            <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Employment Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Company Name *</label>
                <input className={fieldClass} value={formData.employmentCompanyName || ''} onChange={(e) => set({ employmentCompanyName: e.target.value })} required />
              </div>
              <div>
                <label className={labelClass}>Employment Duration *</label>
                <input className={fieldClass} placeholder="e.g. 2 years" value={formData.employmentDuration || ''} onChange={(e) => set({ employmentDuration: e.target.value })} required />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Company Address *</label>
                <input className={fieldClass} value={formData.employmentCompanyAddress || ''} onChange={(e) => set({ employmentCompanyAddress: e.target.value })} required />
              </div>
              <div>
                <label className={labelClass}>Staff ID No (optional)</label>
                <input className={fieldClass} value={formData.staffIdNo || ''} onChange={(e) => set({ staffIdNo: e.target.value })} />
              </div>
            </div>
          </section>
        ) : (
          <section>
            <h3 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Business Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Business Name *</label>
                <input className={fieldClass} value={formData.businessName || ''} onChange={(e) => set({ businessName: e.target.value })} required />
              </div>
              <div>
                <label className={labelClass}>Business RC/BN *</label>
                <input className={fieldClass} value={formData.businessRcBn || ''} onChange={(e) => set({ businessRcBn: e.target.value })} required />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Business Address *</label>
                <input className={fieldClass} value={formData.businessAddress || ''} onChange={(e) => set({ businessAddress: e.target.value })} required />
              </div>
              <div>
                <label className={labelClass}>Business Bank Account No *</label>
                <input className={fieldClass} value={formData.businessBankAccountNo || ''} onChange={(e) => set({ businessBankAccountNo: e.target.value })} required />
              </div>
              <div>
                <label className={labelClass}>Business Bank Name *</label>
                <input className={fieldClass} value={formData.businessBankName || ''} onChange={(e) => set({ businessBankName: e.target.value })} required />
              </div>
              <div>
                <label className={labelClass}>Annual Turnover *</label>
                <input type="number" min="0" className={fieldClass} value={formData.annualTurnover || ''} onChange={(e) => set({ annualTurnover: e.target.value })} required />
              </div>
              <div>
                <label className={labelClass}>Avg. Monthly Turnover *</label>
                <input type="number" min="0" className={fieldClass} value={formData.avgMonthlyTurnover || ''} onChange={(e) => set({ avgMonthlyTurnover: e.target.value })} required />
              </div>
              <div>
                <label className={labelClass}>Date of Incorporation *</label>
                <input type="date" className={fieldClass} value={formData.dateOfIncorporation || ''} onChange={(e) => set({ dateOfIncorporation: e.target.value })} required />
              </div>
              <div>
                <label className={labelClass}>Official Email *</label>
                <input type="email" className={fieldClass} value={formData.officialEmail || ''} onChange={(e) => set({ officialEmail: e.target.value })} required />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Business Ownership (list partners/directors) *</label>
                <textarea rows={3} className={fieldClass} value={formData.businessOwnership || ''} onChange={(e) => set({ businessOwnership: e.target.value })} required />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Nature of Business *</label>
                <input className={fieldClass} value={formData.natureOfBusiness || ''} onChange={(e) => set({ natureOfBusiness: e.target.value })} required />
              </div>
            </div>
          </section>
        )}

        {isPartnerPath && (
          <section>
            <h3 className="text-lg font-bold mb-2 text-gray-800 border-b pb-2">Partner Financing Documents</h3>
            <p className="text-sm text-gray-600 mb-4">
              Required for Partner Financing only. Upload your bank statement and take or upload a live selfie.
            </p>
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Bank Statement (Last 6 Months) *</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
                  className="w-full p-3 border rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#273e8e] file:text-white hover:file:bg-[#1a2b6b]"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) {
                      alert('Bank statement file size must be less than 10MB');
                      e.target.value = '';
                      return;
                    }
                    set({ bankStatement: file });
                  }}
                />
                {formData.bankStatement && (
                  <p className="text-sm text-green-600 mt-1">✓ {formData.bankStatement.name}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">Accepted formats: PDF, JPG, PNG (Max 10MB)</p>
              </div>

              <div>
                <label className={labelClass}>Live Photo / Selfie *</label>
                {cameraStream ? (
                  <div className="relative rounded-lg overflow-hidden border-2 border-[#273e8e] mb-2">
                    <video
                      ref={cameraVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-64 object-cover bg-black"
                    />
                    <canvas ref={cameraCanvasRef} className="hidden" />
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
                      <button
                        type="button"
                        onClick={captureLivePhoto}
                        className="bg-white text-[#273e8e] rounded-full p-3 shadow-lg hover:bg-gray-100 transition-colors border-2 border-[#273e8e]"
                        title="Capture Photo"
                      >
                        <Camera size={28} />
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="bg-red-500 text-white rounded-full p-3 shadow-lg hover:bg-red-600 transition-colors"
                        title="Close Camera"
                      >
                        <X size={28} />
                      </button>
                    </div>
                  </div>
                ) : formData.livePhoto ? (
                  <div className="relative rounded-lg overflow-hidden border border-green-300 bg-green-50 mb-2">
                    <img
                      src={formData.livePhotoPreview || URL.createObjectURL(formData.livePhoto)}
                      alt="Live Photo Preview"
                      className="w-full h-64 object-cover"
                    />
                    <div className="absolute top-2 right-2">
                      <button
                        type="button"
                        onClick={() => set({ livePhoto: null, livePhotoPreview: null })}
                        className="bg-red-500 text-white rounded-full p-1.5 shadow hover:bg-red-600"
                        title="Remove Photo"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <p className="text-sm text-green-700 font-medium p-2 text-center">✓ Live photo captured</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3 mb-2">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#273e8e] text-white text-sm font-medium hover:bg-[#1a2b6b]"
                    >
                      <Camera size={16} /> Take live selfie
                    </button>
                    <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50">
                      Upload selfie image
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) {
                            alert('Selfie file size must be less than 5MB');
                            e.target.value = '';
                            return;
                          }
                          const previewUrl = URL.createObjectURL(file);
                          set({ livePhoto: file, livePhotoPreview: previewUrl });
                        }}
                      />
                    </label>
                  </div>
                )}
                <p className="text-xs text-gray-500">JPG or PNG (Max 5MB). Prefer a clear live selfie.</p>
              </div>
            </div>
          </section>
        )}

        {/* Finance Agreement */}
        <section className="border border-gray-200 rounded-xl p-4 bg-gray-50">
          <label className="flex items-start gap-3 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 text-[#273e8e]"
              checked={!!formData.financeAgreementAccepted}
              onChange={(e) => set({ financeAgreementAccepted: e.target.checked })}
            />
            <span>
              I accept the{' '}
              <button
                type="button"
                className="text-[#273e8e] underline font-semibold"
                onClick={(e) => {
                  e.preventDefault();
                  setShowAgreement(true);
                }}
              >
                Finance Agreement
              </button>
            </span>
          </label>
        </section>

        <button type="submit" className="w-full py-4 rounded-xl font-bold bg-[#273e8e] text-white hover:bg-[#1a2b6b] transition-colors">
          Continue to Credit Check
        </button>
      </form>

      {showAgreement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="text-lg font-bold text-[#273e8e]">Finance Agreement</h3>
              <button type="button" onClick={() => setShowAgreement(false)} className="text-gray-500 hover:text-gray-800">
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
              {agreementText}
            </div>
            <div className="px-5 py-4 border-t flex justify-end gap-3">
              <button type="button" onClick={() => setShowAgreement(false)} className="px-4 py-2 rounded-lg border text-gray-700">
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  set({ financeAgreementAccepted: true });
                  setShowAgreement(false);
                }}
                className="px-4 py-2 rounded-lg bg-[#273e8e] text-white font-medium"
              >
                I Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BnplFinalApplicationForm;
