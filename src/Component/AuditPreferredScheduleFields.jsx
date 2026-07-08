import React from 'react';
import { Calendar, Clock } from 'lucide-react';

export const AUDIT_TIME_SLOTS = [
    '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
];

export const minPreferredAuditDateStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
};

const formatTimeLabel = (value) => {
    const [h, m] = String(value || '').split(':');
    const hour = Number(h);
    if (!Number.isFinite(hour)) return value;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m || '00'} ${suffix}`;
};

/**
 * Preferred audit date & time — shared by BNPL and Buy Now professional audit forms.
 */
const AuditPreferredScheduleFields = ({
    preferredAuditDate,
    preferredAuditTime,
    onDateChange,
    onTimeChange,
}) => (
    <div className="p-4 rounded-xl border border-[#273e8e]/20 bg-[#f8faff] space-y-4">
        <p className="text-sm font-semibold text-[#273e8e] flex items-center gap-2">
            <Calendar size={18} className="shrink-0" />
            Preferred audit schedule
        </p>
        <p className="text-xs text-gray-600 -mt-2">
            Choose when you would like our team to visit. We will confirm the final slot with you.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preferred date *
                </label>
                <input
                    type="date"
                    required
                    min={minPreferredAuditDateStr()}
                    className="w-full p-3 border border-gray-300 rounded-lg"
                    value={preferredAuditDate || ''}
                    onChange={(e) => onDateChange(e.target.value)}
                />
            </div>
            <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                    <Clock size={14} />
                    Preferred time *
                </label>
                <select
                    required
                    className="w-full p-3 border border-gray-300 rounded-lg"
                    value={preferredAuditTime || ''}
                    onChange={(e) => onTimeChange(e.target.value)}
                >
                    <option value="">Select time</option>
                    {AUDIT_TIME_SLOTS.map((slot) => (
                        <option key={slot} value={slot}>
                            {formatTimeLabel(slot)}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    </div>
);

export default AuditPreferredScheduleFields;
