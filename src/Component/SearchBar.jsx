import React, { useState, useEffect, useRef, useContext, useMemo } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { ContextApi } from "../Context/AppContext";
import {
  getItemSearchText,
  itemMatchesStoreCategory,
} from "../utils/storeCatalog";
import {
  sortStoreCatalogItems,
  parseKvaFromSearchQuery,
  catalogItemMatchesKva,
  normalizeKvaValue,
} from "../utils/bundleSort";

const Z_DROPDOWN_BACKDROP = 9999;
const Z_DROPDOWN_PANEL = 10000;

/**
 * props:
 * - categories: [{ id, name }]
 * - products: array of mapped products to filter (from HomePage or SolarBundle)
 * - onFilteringChange: callback(boolean) when filtering state changes
 * - onFilteredResults: callback(filteredArray) when filtered list is computed (e.g. for SolarBundle)
 */
const SearchBar = ({
  categories = [],
  products = [],
  onFilteringChange,
  onFilteredResults,
  showSizeFilter = true,
  categoryValue,
  onCategoryChange,
}) => {
  const { setFilteredResults } = useContext(ContextApi);

  const isCategoryControlled = categoryValue !== undefined;
  const [internalCategoryValue, setInternalCategoryValue] = useState("all");
  const selectedValue = isCategoryControlled ? categoryValue : internalCategoryValue;

  const setSelectedValue = (value) => {
    if (isCategoryControlled) {
      onCategoryChange?.(value);
    } else {
      setInternalCategoryValue(value);
    }
  };

  // Build dropdown options from API cats
  const dropdownOptions = useMemo(() => {
    const base = [{ label: "All", value: "all" }];
    const fromApi = categories.map((c) => ({
      label: c.title || c.name || c.category_name || `Category ${c.id}`,
      value: String(c.id),
    }));
    return [...base, ...fromApi];
  }, [categories]);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  // value = "all" | "<categoryId>"
  const [query, setQuery] = useState("");
  const [selectedSize, setSelectedSize] = useState("all");

  // Size options – match inverter ratings table (value in kVA, labels without "units of ...")
  const sizeOptions = useMemo(() => {
    const sizes = [
      { value: "1.2", label: "1.2kVA/12V" },
      { value: "1.5", label: "1.5kVA/12V" },
      { value: "1.8", label: "1.8kVA/12V" },
      { value: "2.5", label: "2.5kVA/24V" },
      { value: "3.6", label: "3.6kVA/24V" },
      { value: "4.0", label: "4kVA/24V" },
      { value: "5.0", label: "5kVA/48V" },
      { value: "6.0", label: "6kVA/48V" },
      { value: "6.5", label: "6.5kVA/48V" },
      { value: "8.0", label: "8kVA/48V" },
      { value: "10.0", label: "10kVA/48V" },
      { value: "12.0", label: "12kVA/48V" },
      { value: "15.0", label: "15kVA/48V" },
      { value: "18.0", label: "18kVA/48V" },
      { value: "20.0", label: "20kVA/48V" },
    ];
    return [{ label: "All Sizes", value: "all" }, ...sizes];
  }, []);

  const selectedLabel =
    dropdownOptions.find((o) => o.value === selectedValue)?.label || "All";

  const normalizeSearchText = (text) =>
    String(text || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/kv(?!a)/g, "kva");

  // Position dropdown below trigger when open
  useEffect(() => {
    if (!isDropdownOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPosition({ top: rect.bottom + 4, left: rect.left });
  }, [isDropdownOpen]);

  // Close dropdown if clicked outside (including when dropdown is fixed/portaled)
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleClickOutside = (event) => {
      const panel = document.querySelector("[data-search-bar-dropdown-panel]");
      if (triggerRef.current?.contains(event.target) || panel?.contains(event.target)) return;
      setIsDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  // Filter logic (debounced for search, immediate for dropdown selections)
  useEffect(() => {
    // Use shorter delay for dropdown selections, longer for search input
    const delay = query.trim() ? 300 : 0; // Immediate for category/size, debounced for search
    
    const timeoutId = setTimeout(() => {
      if (!products || products.length === 0) {
        setFilteredResults([]);
        if (onFilteringChange) {
          onFilteringChange(false);
        }
        return;
      }

      let results = [...products]; // Start with all products
      // Always parse kVA from query (Solar Store hides size dropdown but search must still work).
      const querySize = parseKvaFromSearchQuery(query);
      const sizeToFilter =
        showSizeFilter && selectedSize !== "all"
          ? parseFloat(selectedSize)
          : querySize;
      const sizeToFilterNorm = sizeToFilter != null ? normalizeKvaValue(sizeToFilter) : null;
      const isFilteringActive =
        selectedValue !== "all" || query.trim() !== "" || (showSizeFilter && selectedSize !== "all");

      // Category filter: strict category_id from admin (dropdown + strip).
      // Bundles only appear for Solar Bundles / Inverter Bundles categories.
      if (selectedValue !== "all") {
        const categoryLabel =
          dropdownOptions.find((o) => o.value === selectedValue)?.label || "";
        results = results.filter((item) =>
          itemMatchesStoreCategory(item, categoryLabel, selectedValue, {
            strict: true,
          })
        );
      }

      const qLower = query.trim().toLowerCase();
      const qNormalized = normalizeSearchText(qLower);

      // True only for capacity-only queries like "1.8", "4kva", "3.6 kw".
      // Product names such as "LitePower1838 (1.8kW+3.8kWh)" must NOT match every 1.8kVA bundle.
      const isCapacityOnlyQuery = (() => {
        if (sizeToFilterNorm == null || !qLower) return false;
        const leftover = qLower
          .replace(/\d+(?:\.\d+)?\s*kv(?:a)?/gi, " ")
          .replace(/\d+(?:\.\d+)?\s*kw\b/gi, " ")
          .replace(/\bkwh\b/gi, " ")
          .replace(/[()+/,\-_&]/g, " ")
          .replace(/\b\d+(?:\.\d+)?\b/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        return leftover.length === 0;
      })();

      if (sizeToFilterNorm !== null && isCapacityOnlyQuery) {
        results = results.filter((item) =>
          catalogItemMatchesKva(item, sizeToFilterNorm)
        );
      } else if (qLower) {
        results = results.filter((item) =>
          normalizeSearchText(getItemSearchText(item)).includes(qNormalized)
        );
      }
      
      const categoryLabel =
        selectedValue !== "all"
          ? dropdownOptions.find((o) => o.value === selectedValue)?.label || ""
          : "";

      results = sortStoreCatalogItems(results, { categoryLabel });

      // Update filtered results in context
      setFilteredResults(results);
      // Notify parent with filtered array (e.g. SolarBundle can display these)
      if (onFilteredResults) {
        onFilteredResults(results);
      }
      // Notify parent about filtering state
      if (onFilteringChange) {
        onFilteringChange(isFilteringActive);
      }
    }, delay);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedValue, selectedSize, products]); // Removed setFilteredResults and onFilteringChange to prevent infinite loops

  return (
    <div className="flex items-center bg-white rounded-lg shadow-sm border border-gray-200 w-[100%] relative" ref={dropdownRef}>
      {/* Dropdown trigger */}
      <div className="relative" ref={triggerRef}>
        <button
          type="button"
          onClick={() => setIsDropdownOpen((prev) => !prev)}
          className="flex items-center gap-8 pl-4 py-3 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
          aria-expanded={isDropdownOpen}
          aria-haspopup="listbox"
        >
          <span className="mr-2 whitespace-nowrap">{selectedLabel}</span>
          <ChevronDown
            size={26}
            className={`transition-transform text-gray-400 ${
              isDropdownOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {/* Dropdown panel: fixed so it's not clipped by overflow-y-auto ancestors */}
      {isDropdownOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/10"
            style={{ zIndex: Z_DROPDOWN_BACKDROP }}
            aria-hidden="true"
            onClick={() => setIsDropdownOpen(false)}
          />
          <div
            data-search-bar-dropdown-panel
            className="fixed max-h-[500px] w-[320px] bg-white rounded-md shadow-lg border border-gray-200 overflow-y-auto"
            style={{
              zIndex: Z_DROPDOWN_PANEL,
              top: dropdownPosition.top,
              left: dropdownPosition.left,
            }}
            role="listbox"
            aria-label="Select category and size"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2 relative border-b border-gray-200 shrink-0">
              <p className="text-center text-gray-500 font-medium">Select Category</p>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(false)}
                className="cursor-pointer absolute top-2.5 right-2 text-gray-500 hover:text-gray-800 p-1"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Category Options */}
            {dropdownOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedValue(option.value);
                }}
                className={`flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-gray-100 ${
                  selectedValue === option.value
                    ? "bg-blue-50 font-semibold"
                    : "text-gray-700"
                }`}
                role="option"
                aria-selected={selectedValue === option.value}
              >
                <span>{option.label}</span>
                <span className="h-4 w-4 rounded-full border border-[#273e8e] flex items-center justify-center">
                  {selectedValue === option.value && (
                    <span className="h-2 w-2 bg-[#273e8e] rounded-full" />
                  )}
                </span>
              </button>
            ))}

            {showSizeFilter && (
              <div className="border-t border-gray-200 mt-2">
                <div className="px-4 py-2 bg-gray-50">
                  <p className="text-center text-gray-500 font-medium">Select Size</p>
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {sizeOptions.map((size) => (
                    <button
                      key={size.value}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedSize(size.value);
                      }}
                      className={`flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-gray-100 ${
                        selectedSize === size.value
                          ? "bg-blue-50 font-semibold"
                          : "text-gray-700"
                      }`}
                      role="option"
                      aria-selected={selectedSize === size.value}
                    >
                      <span>{size.label}</span>
                      <span className="h-4 w-4 rounded-full border border-[#273e8e] flex items-center justify-center">
                        {selectedSize === size.value && (
                          <span className="h-2 w-2 bg-[#273e8e] rounded-full" />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Divider */}
      <div className="h-6 w-px bg-gray-300 mx-2"></div>

      {/* Input Field */}
      <div className="flex-1 flex items-center px-2">
        <Search size={18} className="text-gray-400 mr-2" />
        <input
          id="search-bar-query"
          name="search-query"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or capacity (e.g. 4kVA, 1.5)"
          inputMode="decimal"
          className="w-full px-2 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none"
          aria-label="Search products and bundles"
        />
        {(query || selectedValue !== "all" || (showSizeFilter && selectedSize !== "all")) && (
          <button
            onClick={() => {
              setQuery("");
              setSelectedValue("all");
              setSelectedSize("all");
              // This will trigger the useEffect and clear filters
            }}
            className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
            title="Clear filters"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export default SearchBar;
