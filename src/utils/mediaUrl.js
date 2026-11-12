import { API_ORIGIN } from '../config/api.config';

/** Convert API/storage image paths to absolute URLs (matches Buy Now flow). */
export const toAbsoluteMediaUrl = (path) => {
    if (!path) return '';
    let value = String(path).trim();
    if (!value) return '';

    // Strip host from absolute URLs so wrong APP_URL hosts don't break production.
    const absMatch = value.match(/^https?:\/\/[^/]+(\/.*)$/i);
    if (absMatch) {
        value = absMatch[1];
    } else if (/^https?:\/\//i.test(value)) {
        return value;
    }

    // Fix legacy product uploads stored as /storage/public/...
    value = value.replace(/^\/storage\/public\//, '/storage/');
    value = value.replace(/^storage\/public\//, 'storage/');
    value = value.replace(/^public\//, '');

    if (value.startsWith('/')) {
        return `${API_ORIGIN}${value}`;
    }

    if (value.startsWith('storage/')) {
        return `${API_ORIGIN}/${value}`;
    }

    return `${API_ORIGIN}/storage/${value}`;
};

export const resolveLineItemImageUrl = (lineItem, placeholder = '') => {
    const item = lineItem?.item || lineItem;
    const raw = item?.featured_image_url || item?.featured_image || lineItem?.featured_image;
    if (!raw) return placeholder;
    return toAbsoluteMediaUrl(raw) || placeholder;
};
