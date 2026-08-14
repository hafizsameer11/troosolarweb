/** Whether a catalog category should appear on Solar Store. */
export const isCategoryShownOnStore = (category) => {
  if (!category) return true;
  const flag = category.show_on_store;
  if (flag === false || flag === 0 || flag === "0") return false;
  return true;
};

export const storeVisibleCategories = (categories = []) =>
  (Array.isArray(categories) ? categories : []).filter(isCategoryShownOnStore);

export const hiddenStoreCategoryIds = (categories = []) =>
  new Set(
    (Array.isArray(categories) ? categories : [])
      .filter((category) => !isCategoryShownOnStore(category))
      .map((category) => String(category.id))
  );

export const hiddenStoreCategoryTitles = (categories = []) =>
  (Array.isArray(categories) ? categories : [])
    .filter((category) => !isCategoryShownOnStore(category))
    .map((category) => String(category.title || category.name || "").trim().toLowerCase())
    .filter(Boolean);

export const isCatalogItemHiddenFromStore = (item, allCategories = []) => {
  const hiddenIds = hiddenStoreCategoryIds(allCategories);
  const hiddenTitles = hiddenStoreCategoryTitles(allCategories);

  if (item?.itemType === "bundle" || item?.bundle) {
    const label = String(item.categoryName || item.bundleTitle || "").trim().toLowerCase();
    return hiddenTitles.some(
      (title) => title === label || (title && label && (title.includes(label) || label.includes(title)))
    );
  }

  if (item?.categoryId != null && hiddenIds.has(String(item.categoryId))) {
    return true;
  }

  const name = String(item?.categoryName || "").trim().toLowerCase();
  return hiddenTitles.some((title) => title === name);
};
