import { API_ORIGIN } from '../config/api.config';

/** Convert API/storage image paths to absolute URLs (matches Buy Now flow). */
export const toAbsoluteMediaUrl = (path) => {
    if (!path) return '';
    const value = String(path).trim();
    if (!value) return '';

    if (/^https?:\/\//i.test(value)) return value;

    if (value.startsWith('/')) {
        return `${API_ORIGIN}${value}`;
    }

    const cleaned = value.replace(/^public\//, '');
    if (cleaned.startsWith('storage/')) {
        return `${API_ORIGIN}/${cleaned}`;
    }

    return `${API_ORIGIN}/storage/${cleaned}`;
};

export const resolveLineItemImageUrl = (lineItem, placeholder = '') => {
    const item = lineItem?.item || lineItem;
    const raw = item?.featured_image_url || item?.featured_image || lineItem?.featured_image;
    if (!raw) return placeholder;
    return toAbsoluteMediaUrl(raw) || placeholder;
};
