import { resolveFlowDeliveryFee } from './categoryDeliveryFees';

const PRODUCT_ONLY_FEE_CATEGORIES = new Set(['battery-only', 'inverter-only', 'panels-only']);

const categoryFeeAmount = (categoryKey, feeMap, globalFallback = 0) => {
    const key = String(categoryKey || '').trim();
    if (key && feeMap && feeMap[key] != null && feeMap[key] !== '') {
        return Number(feeMap[key]) || 0;
    }
    return Number(globalFallback) || 0;
};

const sumCategoryFeeAmounts = (categoryKeys, feeMap, globalFallback = 0) => {
    const keys = [...new Set((categoryKeys || []).map((k) => String(k || '').trim()).filter(Boolean))];
    if (keys.length === 0) return 0;
    return keys.reduce((sum, key) => sum + categoryFeeAmount(key, feeMap, globalFallback), 0);
};

/**
 * Infer Buy Now product-only fee category from catalog product metadata.
 * Mirrors backend ProductSelectionController grouping rules.
 */
export const inferProductFeeCategory = (product, fallbackCategory = '') => {
    const fallback = String(fallbackCategory || '').trim();
    if (!product) return PRODUCT_ONLY_FEE_CATEGORIES.has(fallback) ? fallback : '';

    const title = String(product.title || product.name || '').trim().toLowerCase();
    const categoryTitle = String(
        product.category?.title
        || product.category?.name
        || product.category_name
        || ''
    ).trim().toLowerCase();

    const isBatteryTitle = title.includes('battery')
        || title.includes('batteries')
        || title.includes('lithium')
        || title.includes('rack');
    const isBatteryCategory = categoryTitle.includes('battery')
        || categoryTitle.includes('batteries')
        || categoryTitle.includes('lithium')
        || categoryTitle.includes('rack');
    const isInverterTitle = title.includes('inverter');
    const isInverterCategory = categoryTitle.includes('inverter');
    const isPanelTitle = title.includes('panel') || title.includes('pv');
    const isPanelCategory = categoryTitle.includes('panel') || categoryTitle.includes('pv');
    const isKwhTitle = title.includes('kwh');
    const isAllInOneSystem = title.includes('all in one')
        || title.includes('all-in-one')
        || title.includes('aio')
        || title.includes('system');
    const isAllInOneCategory = categoryTitle.includes('all in one')
        || categoryTitle.includes('all-in-one')
        || categoryTitle.includes('aio')
        || categoryTitle.includes('system');

    if (
        (isPanelTitle || isPanelCategory)
        && !isInverterTitle
        && !isBatteryTitle
        && !isInverterCategory
        && !isBatteryCategory
    ) {
        return 'panels-only';
    }

    if (
        (isInverterTitle || isInverterCategory)
        && !isBatteryTitle
        && !isPanelTitle
        && !isBatteryCategory
        && !isPanelCategory
    ) {
        return 'inverter-only';
    }

    if (
        (isBatteryTitle || isBatteryCategory || isKwhTitle)
        && !isPanelTitle
        && !isPanelCategory
        && !isAllInOneSystem
        && !isAllInOneCategory
        && !(isInverterTitle && !isKwhTitle)
    ) {
        return 'battery-only';
    }

    return PRODUCT_ONLY_FEE_CATEGORIES.has(fallback) ? fallback : '';
};

export const resolveSelectedProductFeeCategories = (selectedProducts = [], fallbackCategory = '') => {
    const keys = [];

    (selectedProducts || []).forEach((selection) => {
        const product = selection?.product || selection;
        const inferred = selection?.feeCategory
            || inferProductFeeCategory(product, fallbackCategory);
        if (inferred) keys.push(inferred);
    });

    const unique = [...new Set(keys)];
    if (unique.length > 0) return unique;

    const fallback = String(fallbackCategory || '').trim();
    return PRODUCT_ONLY_FEE_CATEGORIES.has(fallback) ? [fallback] : [];
};

const resolveSummedDeliveryFee = ({
    categoryKeys,
    fallbackCategory,
    categoryDeliveryFees,
    defaultDeliveryFee,
    stateDeliveryFee,
}) => {
    const stateFee = stateDeliveryFee != null ? Number(stateDeliveryFee) : null;
    if (stateFee != null && stateFee > 0) {
        return stateFee;
    }

    const keys = categoryKeys.length > 0
        ? categoryKeys
        : (PRODUCT_ONLY_FEE_CATEGORIES.has(fallbackCategory) ? [fallbackCategory] : []);

    if (keys.length <= 1) {
        return resolveFlowDeliveryFee({
            productCategory: keys[0] || fallbackCategory,
            categoryDeliveryFees,
            defaultDeliveryFee,
            stateDeliveryFee: null,
        });
    }

    return sumCategoryFeeAmounts(keys, categoryDeliveryFees, defaultDeliveryFee);
};

/**
 * Product-only checkout fees (battery / inverter / panels). Bundles use bundle invoice fees only.
 */
export const resolveProductOnlyCheckoutFees = ({
    selectedProducts = [],
    fallbackCategory = '',
    checkoutSettings = {},
    installerChoice = 'troosolar',
    includeInstallationMaterial = false,
    stateDeliveryFee = null,
}) => {
    const categoryKeys = resolveSelectedProductFeeCategories(selectedProducts, fallbackCategory);
    const installerIsTroosolar = installerChoice !== 'own';
    const ownMaterialsOptIn = installerChoice === 'own' && !!includeInstallationMaterial;
    const ownInstallerGetsInspection = !!checkoutSettings?.own_installer_include_inspection;

    const deliveryFee = resolveSummedDeliveryFee({
        categoryKeys,
        fallbackCategory,
        categoryDeliveryFees: checkoutSettings?.category_delivery_fees,
        defaultDeliveryFee: checkoutSettings?.delivery_fee,
        stateDeliveryFee,
    });

    const installationFee = sumCategoryFeeAmounts(
        categoryKeys,
        checkoutSettings?.category_installation_fees,
        checkoutSettings?.installation_flat_addon ?? 0
    );
    const inspectionFee = sumCategoryFeeAmounts(
        categoryKeys,
        checkoutSettings?.category_inspection_fees,
        0
    );
    const materialCost = sumCategoryFeeAmounts(
        categoryKeys,
        checkoutSettings?.category_materials_fees,
        checkoutSettings?.installation_materials_cost
            ?? checkoutSettings?.installation_material_cost
            ?? 0
    );

    if (installerIsTroosolar) {
        return {
            deliveryFee,
            installationFee,
            inspectionFee,
            materialCost,
        };
    }

    if (ownMaterialsOptIn) {
        return {
            deliveryFee,
            installationFee: 0,
            inspectionFee: ownInstallerGetsInspection ? inspectionFee : 0,
            materialCost,
        };
    }

    return {
        deliveryFee,
        installationFee: 0,
        inspectionFee: 0,
        materialCost: 0,
    };
};
