import React from "react";
import {
  Layers,
  BatteryCharging,
  Battery,
  PlugZap,
  PanelsTopLeft,
} from "lucide-react";

/**
 * Select Product Category — 3 cards top row, 2 centered bottom row.
 * Row 1: Solar full kit · Inverter + battery · Battery only
 * Row 2: Inverter only · Solar panels only
 */
export const PRODUCT_CATEGORY_GRID_ROWS = [
  ["full-kit", "inverter-battery", "battery-only"],
  ["inverter-only", "panels-only"],
];

export const PRODUCT_CATEGORY_DEFS = {
  "full-kit": {
    id: "full-kit",
    name: "Solar panels, inverter, and battery solution",
    icon: Layers,
  },
  "inverter-battery": {
    id: "inverter-battery",
    name: "Inverter and battery solution",
    icon: BatteryCharging,
  },
  "battery-only": {
    id: "battery-only",
    name: "Battery only",
    icon: Battery,
    subtitle: "Choose battery capacity",
  },
  "inverter-only": {
    id: "inverter-only",
    name: "Inverter only",
    icon: PlugZap,
    subtitle: "Choose inverter capacity",
  },
  "panels-only": {
    id: "panels-only",
    name: "Solar panels only",
    icon: PanelsTopLeft,
    subtitle: "Choose solar panel capacity",
  },
};

/** Human-readable solution label for order/audit displays. */
export function labelProductCategory(value) {
  const v = String(value || "").toLowerCase().trim();
  if (!v) return "";
  if (PRODUCT_CATEGORY_DEFS[v]?.name) return PRODUCT_CATEGORY_DEFS[v].name;
  if (v === "audit") return "Professional energy audit";
  return String(value).replace(/-/g, " ");
}

const ProductCategoryGrid = ({ onSelect }) => {
  const renderCategoryCard = (groupId) => {
    const group = PRODUCT_CATEGORY_DEFS[groupId];
    if (!group) return null;
    const IconComponent = group.icon;

    return (
      <button
        key={group.id}
        type="button"
        onClick={() => onSelect(group.id)}
        className="group bg-white border-2 border-gray-200 hover:border-[#273e8e] rounded-2xl p-6 hover:shadow-2xl transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden transform hover:-translate-y-1 w-full"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#273e8e] to-[#E8A91D]" />
        <div className="bg-gradient-to-br from-[#273e8e]/10 to-[#E8A91D]/10 p-5 rounded-full mb-4 group-hover:from-[#273e8e]/20 group-hover:to-[#E8A91D]/20 transition-all duration-300 flex items-center justify-center min-h-[72px] w-[72px]">
          <IconComponent
            size={36}
            className="text-[#273e8e] group-hover:scale-110 transition-transform"
          />
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-1 group-hover:text-[#273e8e] transition-colors">
          {group.name}
        </h3>
        {group.subtitle ? (
          <p className="text-sm text-gray-500 italic">{group.subtitle}</p>
        ) : null}
      </button>
    );
  };

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      {PRODUCT_CATEGORY_GRID_ROWS.map((row) => (
        <div
          key={row.join("-")}
          className={
            row.length === 3
              ? "grid grid-cols-1 md:grid-cols-3 gap-6"
              : "grid grid-cols-1 md:grid-cols-2 gap-6 md:max-w-4xl md:mx-auto"
          }
        >
          {row.map((groupId) => renderCategoryCard(groupId))}
        </div>
      ))}
    </div>
  );
};

export default ProductCategoryGrid;
