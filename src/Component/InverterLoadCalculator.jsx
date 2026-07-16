import React, { useState, useEffect } from "react";
import { Minus, Plus, Search, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import API from "../config/api.config";

// Load range (kW) -> Minimum Recommended Inverter Rating (per shared sheet screenshot)
const DEFAULT_INVERTER_SELECTION_RANGES = [
  { minKw: 0.0, maxKw: 0.96, targetKva: 1.2, voltageV: 12, label: "1.2kVA/12V" },
  { minKw: 0.96, maxKw: 1.13, targetKva: 1.5, voltageV: 12, label: "1.5kVA/12V" },
  { minKw: 1.13, maxKw: 1.35, targetKva: 1.8, voltageV: 12, label: "1.8kVA/12V" },
  { minKw: 1.35, maxKw: 1.88, targetKva: 2.5, voltageV: 24, label: "2.5kVA/24V" },
  { minKw: 1.88, maxKw: 2.52, targetKva: 3.6, voltageV: 24, label: "3.6kVA/24V" },
  { minKw: 2.52, maxKw: 2.89, targetKva: 4.0, voltageV: 24, label: "4kVA/24V" },
  { minKw: 2.89, maxKw: 4.0, targetKva: 5.0, voltageV: 48, label: "5kVA/48V" },
  { minKw: 4.0, maxKw: 4.2, targetKva: 6.0, voltageV: 48, label: "6kVA/48V" },
  { minKw: 4.2, maxKw: 4.5, targetKva: 6.5, voltageV: 48, label: "6.5kVA/48V" },
  { minKw: 4.5, maxKw: 6.0, targetKva: 8.0, voltageV: 48, label: "8kVA/48V" },
  { minKw: 6.0, maxKw: 7.5, targetKva: 10.0, voltageV: 48, label: "10kVA/48V" },
  { minKw: 7.5, maxKw: 9.0, targetKva: 12.0, voltageV: 48, label: "12kVA/48V" },
  { minKw: 9.0, maxKw: 11.5, targetKva: 15.0, voltageV: 48, label: "15kVA/48V" },
  { minKw: 11.5, maxKw: 13.5, targetKva: 18.0, voltageV: 48, label: "18kVA/48V" },
  { minKw: 13.5, maxKw: 15.0, targetKva: 20.0, voltageV: 48, label: "20kVA/48V" },
];

const InverterLoadCalculator = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const returnTo = searchParams.get("returnTo"); // "buy-now" | "bnpl"
  const source = searchParams.get("source"); // "flow" when opened from BNPL/BuyNow flow
  const previousStep = searchParams.get("previousStep");
  const category = searchParams.get("category") || ""; // full-kit | inverter-battery | battery-only
  const fromBundles = searchParams.get("fromBundles") === "true";
  // Comprehensive appliance data from the Excel spreadsheet
  const applianceList = [
    // TVs
    { name: "22 Inch LED TV", power: 20 },
    { name: "32 Inch LED TV", power: 55 },
    { name: "42 Inch LED TV", power: 70 },
    { name: "46 Inch LED TV", power: 70 },
    { name: "55 Inch LED TV", power: 100 },
    { name: "65 Inch LED TV", power: 150 },
    { name: "82 Inch LED TV", power: 250 },
    { name: "Television", power: 120 },
    
    // Kitchen Appliances
    { name: "Air Fryer", power: 1500 },
    { name: "Coffee Machine", power: 1500 },
    { name: "Dishwasher", power: 1500 },
    { name: "Electric Kettle", power: 3000 },
    { name: "Electric Pressure Cooker", power: 1000 },
    { name: "Electric Stove", power: 2000 },
    { name: "Electric Water Heater", power: 1500 },
    { name: "Food Processor", power: 400 },
    { name: "Food Dehydrator", power: 800 },
    { name: "Deep Fryer", power: 1000 },
    { name: "Electric Iron", power: 1000 },
    { name: "Smart Inverter Microwave", power: 1000 },
    { name: "Electric Oven", power: 2150 },
    { name: "Pressure Cooker", power: 700 },
    { name: "Sandwich Maker", power: 1000 },
    { name: "Steam Iron", power: 2500 },
    { name: "Toaster", power: 1200 },
    { name: "Cooker Hood", power: 100 },
    { name: "Kitchen Extractor Fan", power: 200 },
    
    // Refrigeration
    { name: "Double Door Refrigerator", power: 220 },
    { name: "Chest Freezer", power: 20 },
    { name: "Freezer", power: 220 },
    { name: "Fridge", power: 200 },
    { name: "Fridge & Freezer", power: 400 },
    { name: "Refrigerator", power: 200 },
    { name: "Table Top Fridge", power: 65 },
    { name: "Wine Cooler", power: 100 },
    
    // Fans
    { name: "Ceiling Fan", power: 70 },
    { name: "Standing Fan", power: 70 },
    { name: "Table Fan", power: 25 },
    { name: "Wall Fan", power: 60 },
    { name: "Ox Fan", power: 150 },
    { name: "Fan", power: 70 },
    
    // Computers & Electronics
    { name: "Desktop Computer", power: 200 },
    { name: "Laptop Computer", power: 100 },
    { name: "Gaming Computer", power: 600 },
    { name: "Computer Monitor", power: 30 },
    { name: "Tablet Computer", power: 10 },
    { name: "Tablet Charger", power: 15 },
    { name: "Game Console", power: 200 },
    { name: "Playstation 4", power: 90 },
    { name: "Playstation 5", power: 200 },
    { name: "Xbox One", power: 110 },
    { name: "DVD Player", power: 60 },
    { name: "Projector", power: 250 },
    { name: "Home Sound System", power: 95 },
    
    // Lighting
    { name: "LED Light Bulb", power: 3 },
    { name: "LED Light Bulb (6W)", power: 6 },
    { name: "LED Light Bulb (10W)", power: 10 },
    { name: "LED Light Bulb (12W)", power: 12 },
    { name: "LED Light Bulb (18W)", power: 18 },
    { name: "LED Light Bulb (32W)", power: 32 },
    { name: "LED Halogen Light Bulb", power: 100 },
    { name: "Fluorescent Lamp", power: 45 },
    { name: "Table Lamp", power: 65 },
    
    // Air Conditioning & Climate
    { name: "Inverter Air Conditioner (1HP)", power: 767 },
    { name: "Inverter Air Conditioner (1.5HP)", power: 1200 },
    { name: "Inverter Air Conditioner (2HP)", power: 1600 },
    { name: "Inverter Air Conditioner", power: 767 },
    { name: "Air Purifier", power: 30 },
    { name: "Dehumidifier", power: 240 },
    { name: "Humidifier", power: 40 },
    
    // Water & Dispensers
    { name: "Water Dispenser", power: 100 },
    { name: "Hot Water Dispenser", power: 1300 },
    { name: "Electric Boiler", power: 14000 },
    { name: "Aquarium Pump", power: 50 },
    
    // Laundry
    { name: "Washing Machine", power: 800 },
    { name: "Smart Washing Machine", power: 800 },
    { name: "Washing Machine & Dryer", power: 2400 },
    { name: "Clothes Dryer", power: 5000 },
    
    // Personal Care
    { name: "Hair Blow Dryer", power: 1500 },
    { name: "Heated Hair Rollers", power: 400 },
    { name: "Hair Straighteners", power: 300 },
    { name: "Electric Shaver", power: 20 },
    
    // Office Equipment
    { name: "Printer", power: 120 },
    { name: "Inkjet Printer", power: 30 },
    { name: "Laser Printer", power: 800 },
    { name: "Scanner", power: 20 },
    { name: "Paper Shredder", power: 220 },
    { name: "Sewing Machine", power: 100 },
    { name: "Soldering Iron", power: 60 },
    
    // Entertainment & Communication
    { name: "DSTV Box", power: 30 },
    { name: "Home Internet Router", power: 15 },
    { name: "WiFi Router", power: 10 },
    
    // Tools & Equipment
    { name: "Electric Drill", power: 850 },
    { name: "Cordless Drill Charger", power: 150 },
    { name: "Electric Mower", power: 1500 },
    { name: "Lawnmower", power: 1400 },
    { name: "Electric Garage Door", power: 400 },
    { name: "Vacuum Cleaner", power: 900 },
    { name: "Treadmill", power: 900 },
    
    // Pumps & Motors
    { name: "Pumping Machine (0.5HP)", power: 2500 },
    { name: "Pumping Machine (1HP)", power: 5000 },
    { name: "Pumping Machine (1.5HP)", power: 7500 },
    { name: "Pumping Machine (2HP)", power: 10000 },
    { name: "Pumping Machine", power: 2500 },
    
    // Other Appliances
    { name: "Extractor Fan", power: 12 },
    { name: "Jacuzzi", power: 7500 },
    { name: "Steriliser", power: 650 },
  ];

  // State for appliances with quantity
  const [appliances, setAppliances] = useState(
    applianceList.map((appliance) => ({ ...appliance, quantity: 0, hours: 0 }))
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddAppliance, setShowAddAppliance] = useState(false);
  const [newApplianceName, setNewApplianceName] = useState("");
  const [newAppliancePower, setNewAppliancePower] = useState("");

  const [inverterSelectionRanges, setInverterSelectionRanges] = useState(
    DEFAULT_INVERTER_SELECTION_RANGES
  );

  // Decide when to restore saved appliances from localStorage
  const shouldRestoreFromStorage =
    fromBundles || (source === "flow" && !!returnTo);
  // Filter appliances based on search term
  const filteredAppliances = appliances.filter((appliance) =>
    appliance.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const fetchCalculatorSettings = async () => {
      try {
        const { data } = await axios.get(API.CONFIG_CALCULATOR_SETTINGS, {
          headers: { Accept: "application/json" },
        });
        const payload = data?.data ?? data ?? {};
        const ranges = Array.isArray(payload?.inverter_ranges)
          ? payload.inverter_ranges
          : [];
        if (ranges.length > 0) {
          const normalized = ranges
            .map((r) => ({
              minKw: Number(r?.min_kw),
              maxKw: Number(r?.max_kw),
              targetKva: Number(r?.target_kva),
              voltageV: Number(r?.voltage_v ?? r?.voltageV),
              label: String(r?.label || ""),
            }))
            .filter(
              (r) =>
                Number.isFinite(r.minKw) &&
                Number.isFinite(r.maxKw) &&
                Number.isFinite(r.targetKva) &&
                (r.label || Number.isFinite(r.voltageV))
            )
            .sort((a, b) => a.minKw - b.minKw);
          const approxEq = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
          const looksLikeSheet = (() => {
            if (normalized.length < 6) return false;
            // Reject old "or" labels that caused wrong display/selection.
            if (normalized.some((r) => /(?:\s|^)or(?:\s|$)/i.test(String(r.label || "")))) {
              return false;
            }
            // 2.52–2.89 => 4.0 (unchanged)
            const has4 = normalized.some(
              (r) =>
                approxEq(r.minKw, 2.52, 0.02) &&
                approxEq(r.maxKw, 2.89, 0.02) &&
                (approxEq(r.targetKva, 4.0, 0.05) || approxEq(r.targetKva, 4, 0.05))
            );
            if (!has4) return false;
            // New sheet: 1.35–1.88 => 2.5 and 1.88–2.52 => 3.6
            const has25And36 = normalized.some(
              (r) =>
                approxEq(r.minKw, 1.35, 0.02) &&
                approxEq(r.maxKw, 1.88, 0.02) &&
                approxEq(r.targetKva, 2.5, 0.05)
            ) &&
              normalized.some(
                (r) =>
                  approxEq(r.minKw, 1.88, 0.02) &&
                  approxEq(r.maxKw, 2.52, 0.02) &&
                  approxEq(r.targetKva, 3.6, 0.05)
              );
            // Legacy single band (pre–2.5kVA tier): 1.35–2.52 => 3.6
            const hasLegacy36 = normalized.some(
              (r) =>
                approxEq(r.minKw, 1.35, 0.02) &&
                approxEq(r.maxKw, 2.52, 0.02) &&
                approxEq(r.targetKva, 3.6, 0.05)
            );
            return has25And36 || hasLegacy36;
          })();

          if (normalized.length > 0 && looksLikeSheet) {
            setInverterSelectionRanges(normalized);
          }
        }
      } catch {
        // Keep defaults when API is unavailable.
      }
    };
    fetchCalculatorSettings();
  }, []);

  // When user returns from bundles or BNPL/BuyNow flow ("Edit load"), restore previous appliance entries.
  useEffect(() => {
    if (!shouldRestoreFromStorage) return;
    try {
      const raw = localStorage.getItem("loadCalculatorAppliances");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved) || saved.length === 0) return;

      const base = applianceList.map((appliance) => ({
        ...appliance,
        quantity: 0,
        hours: 0,
      }));

      const merged = [...base];
      saved.forEach((item) => {
        const name = String(item?.name || "").trim();
        if (!name) return;
        const existingIdx = merged.findIndex((a) => a.name === name);
        const next = {
          name,
          power: Number(item?.power) || 0,
          quantity: Math.max(0, Number(item?.quantity) || 0),
          hours: Math.max(0, Number(item?.hours) || 0),
        };
        if (existingIdx >= 0) {
          merged[existingIdx] = { ...merged[existingIdx], ...next };
        } else {
          merged.push(next);
        }
      });

      setAppliances(merged);
    } catch (e) {
      console.warn("Failed to restore calculator data:", e);
    }
  }, [shouldRestoreFromStorage]);

  // Per row: Power (W) = Quantity * Watts; Watts Hours / Day = Power (W) * Hours/Day
  const totalLoadW = appliances.reduce(
    (sum, a) => sum + (a.power || 0) * (a.quantity || 0),
    0
  );
  const totalEnergyWh = appliances.reduce(
    (sum, a) => sum + (a.power || 0) * (a.quantity || 0) * (a.hours || 0),
    0
  );
  const totalEnergyKwh = totalEnergyWh / 1000;
  const totalLoadKw = totalLoadW / 1000;
  const findRange = (kw) => {
    if (!Number.isFinite(kw) || kw <= 0) return null;
    // Avoid overlap issues by treating maxKw as exclusive, except for the last range.
    for (let i = 0; i < inverterSelectionRanges.length; i++) {
      const r = inverterSelectionRanges[i];
      const isLast = i === inverterSelectionRanges.length - 1;
      const within =
        kw >= r.minKw && (isLast ? kw <= r.maxKw : kw < r.maxKw);
      if (within) return r;
    }
    return inverterSelectionRanges[inverterSelectionRanges.length - 1] || null;
  };
  // Proposed inverter rating follows the sheet "Load Range" using the raw load (kW).
  // We apply +30% headroom only when querying recommended bundles.
  const selectedRange = totalLoadKw > 0 ? findRange(totalLoadKw) : null;
  const displayInverterW = Math.max(0, Math.round(totalLoadW));
  const formatKva = (n) => {
    if (!Number.isFinite(n)) return "";
    return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(1);
  };
  const inferVoltageV = (kva) => {
    if (!Number.isFinite(kva)) return null;
    // Per the provided load→rating table (12V up to 1.8kVA; 24V through 4kVA; 48V above).
    if (kva <= 1.8) return 12;
    if (kva <= 4.0) return 24;
    return 48;
  };
  const proposedRatingText = (() => {
    if (selectedRange?.label && /units of/i.test(String(selectedRange.label))) {
      // Keep multi-unit guidance labels as-is (10kVA - 2 units..., etc).
      return String(selectedRange.label).trim();
    }
    if (selectedRange && Number.isFinite(selectedRange.targetKva)) {
      const kvaStr = formatKva(Number(selectedRange.targetKva));
      const v =
        Number.isFinite(selectedRange.voltageV) && selectedRange.voltageV > 0
          ? Math.round(Number(selectedRange.voltageV))
          : inferVoltageV(Number(selectedRange.targetKva));
      return v ? `${kvaStr}kVA/${v}V` : `${kvaStr}kVA`;
    }
    // Fallback when no range selected
    return `${formatKva(displayInverterW / 1000)}kVA`;
  })();

  // Recommendation target used for bundle query after user proceeds.
  // Match the sizing rule: +30% headroom.
  const recommendationInverterW = Math.max(0, Math.round(totalLoadW * 1.3));
  const peakLoadW = totalLoadW;

  // Handle proceed button - navigate back with load (q parameter)
  const handleProceed = () => {
    // Keep UI showing exact inverter rating from load, but query bundles using +43% target.
    const q = recommendationInverterW;
    const originalLoad = Math.max(0, Math.round(peakLoadW));
    if (q <= 0 || originalLoad <= 0) {
      alert("Please add appliance quantity/load before proceeding.");
      return;
    }
    
    // Save appliances to localStorage for bundle detail page
    try {
      const appliancesForBundle = appliances
        .filter((a) => (a.quantity || 0) > 0)
        .map((a) => ({ 
          name: a.name, 
          power: a.power, 
          quantity: a.quantity || 0, 
          hours: a.hours || 0 
        }));
      if (appliancesForBundle.length > 0) {
        localStorage.setItem("loadCalculatorAppliances", JSON.stringify(appliancesForBundle));
      }
    } catch (e) {
      console.warn("Failed to save calculator data:", e);
    }
    
    // Return to Buy Now or BNPL flow with:
    // - q: boosted value for bundle matching
    // - load: original peak load for display text
    const categoryParam = category ? `&category=${encodeURIComponent(category)}` : "";
    const proposedKva = selectedRange ? Number(selectedRange.targetKva) : Number((displayInverterW / 1000).toFixed(1));
    const baseParams = `q=${q}&load=${originalLoad}&kva=${encodeURIComponent(String(proposedKva))}&fromCalculator=true${categoryParam}`;
    if (returnTo === "buy-now") {
      navigate(`/buy-now?step=3.5&${baseParams}`);
      return;
    }
    if (returnTo === "bnpl") {
      navigate(`/bnpl?step=3.5&${baseParams}`);
      return;
    }
    
    // Default: go to solar bundles if no returnTo specified
    navigate(`/solar-bundles?${baseParams}`);
  };

  const handleGoBack = () => {
    const categoryParam = category ? `&category=${encodeURIComponent(category)}` : "";
    const fallbackStep = Number.isFinite(Number(previousStep)) ? Number(previousStep) : 3;
    if (source === "flow" && returnTo === "buy-now") {
      navigate(`/buy-now?step=${encodeURIComponent(String(fallbackStep))}${categoryParam}`);
      return;
    }
    if (source === "flow" && returnTo === "bnpl") {
      navigate(`/bnpl?step=${encodeURIComponent(String(fallbackStep))}${categoryParam}`);
      return;
    }
    navigate("/tools?tool=inverter");
  };

  // Update quantity for an appliance
  const updateQuantity = (index, newQuantity) => {
    const updatedAppliances = [...appliances];
    // Find the actual index in the original array
    const originalIndex = appliances.findIndex(
      (item) => item.name === filteredAppliances[index].name
    );
    updatedAppliances[originalIndex].quantity = Math.max(0, newQuantity);
    setAppliances(updatedAppliances);
  };

  // Update usage hours for an appliance
  const updateHours = (index, hours) => {
    const updatedAppliances = [...appliances];
    const originalIndex = appliances.findIndex(
      (item) => item.name === filteredAppliances[index].name
    );
    updatedAppliances[originalIndex].hours = Math.max(0, hours);
    setAppliances(updatedAppliances);
  };

  const updatePower = (index, newPower) => {
    const updatedAppliances = [...appliances];
    const originalIndex = appliances.findIndex(
      (item) => item.name === filteredAppliances[index].name
    );
    const value = parseInt(String(newPower).replace(/\D/g, ""), 10);
    updatedAppliances[originalIndex].power = Number.isNaN(value) ? 0 : Math.max(0, value);
    setAppliances(updatedAppliances);
  };

  // Add custom appliance
  const handleAddCustomAppliance = () => {
    if (!newApplianceName.trim() || !newAppliancePower || Number(newAppliancePower) <= 0) {
      alert("Please enter a valid appliance name and wattage.");
      return;
    }

    const newAppliance = {
      name: newApplianceName.trim(),
      power: Number(newAppliancePower),
      quantity: 1,
      hours: 0
    };

    setAppliances([...appliances, newAppliance]);
    setNewApplianceName("");
    setNewAppliancePower("");
    setShowAddAppliance(false);
  };

  return (
    <>
      {/* Desktop View  */}
      <div className="min-h-screen sm:block hidden bg-[#f5f6ff] px-10 py-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-medium">Inverter Load Calculator</h1>
          <p className="text-gray-500 mt-2 max-w-2xl text-base">
            Estimate total power needs to select a suitable inverter and battery
            size for efficient backup.
          </p>
        </div>

        {/* Main Grid */}
        <button
          type="button"
          onClick={handleGoBack}
          className="text-[#273e8e] underline text-left"
        >
          Go Back
        </button>
        <div className="grid grid-cols-12 gap-6 w-full mt-4">
          {/* LOAD CALCULATION table — columns match Excel: Appliance | Quantity | Watts | Power (W) | Hours/Day | Watts Hours / Day */}
          <div className="col-span-8 space-y-4">
            {/* Search */}
            <div className="flex items-center w-full border-2 border-gray-300 rounded-xl bg-white px-4 py-3">
              <Search className="text-gray-400 w-6 h-6 mr-3" />
              <input
                type="text"
                className="w-full outline-none text-[16px] bg-transparent placeholder:text-gray-400"
                placeholder="Search appliances"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Table Headers — match Excel: Appliance | Quantity | Watts | Power (W) | Hours/Day | Watts Hours / Day */}
            <div className="grid grid-cols-6 text-[13px] text-gray-700 font-medium gap-2">
              <p className="text-left">Appliance</p>
              <p className="text-center">Quantity</p>
              <p className="text-center">Watts</p>
              <p className="text-center">Power (W)</p>
              <p className="text-center">Hours/Day</p>
              <p className="text-center">Watts Hours / Day</p>
            </div>

            {/* Appliance List */}
            <div className="rounded-2xl border bg-white p-4 divide-y">
              {filteredAppliances.map((item, index) => {
                const powerW = (item.power || 0) * (item.quantity || 0);
                const hoursPerDay = item.hours ?? 0;
                const wattsHoursPerDay = powerW * hoursPerDay;

                return (
                  <div
                    key={index}
                    className="grid grid-cols-6 items-center gap-2 py-3 text-sm"
                  >
                    <p className="font-normal text-left truncate" title={item.name}>{item.name}</p>
                    <div className="flex justify-center items-center gap-1">
                      <button
                        type="button"
                        className="bg-[#273e8e] text-white rounded p-1 cursor-pointer"
                        onClick={() => updateQuantity(index, item.quantity - 1)}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center">{item.quantity}</span>
                      <button
                        type="button"
                        className="bg-[#273e8e] text-white rounded p-1 cursor-pointer"
                        onClick={() => updateQuantity(index, item.quantity + 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <input
                      type="number"
                      value={item.power}
                      onChange={(e) => updatePower(index, e.target.value)}
                      min={0}
                      className="w-14 mx-auto px-1 py-1 text-center outline-none rounded border border-gray-200 bg-gray-50 text-gray-800 text-xs focus:border-[#273e8e] focus:ring-1 focus:ring-[#273e8e]"
                    />
                    <p className="text-center font-medium">{powerW}</p>
                    <input
                      type="number"
                      value={item.hours}
                      onChange={(e) =>
                        updateHours(index, parseInt(e.target.value, 10) || 0)
                      }
                      placeholder="0"
                      min={0}
                      className="w-14 mx-auto px-1 py-1 text-center outline-none rounded border border-gray-200 bg-gray-50 text-gray-800 text-xs focus:border-[#273e8e] focus:ring-1 focus:ring-[#273e8e]"
                    />
                    <p className="text-center font-medium">{wattsHoursPerDay}</p>
                  </div>
                );
              })}
            </div>

            {/* Add Custom Appliance Section */}
            {!showAddAppliance ? (
              <button
                className="bg-white border-2 border-[#273e8e] text-[#273e8e] rounded-full px-6 text-sm w-full py-5 mt-4 flex items-center justify-center gap-2 hover:bg-[#273e8e] hover:text-white transition-colors"
                onClick={() => setShowAddAppliance(true)}
              >
                <Plus size={18} />
                Add Custom Appliance
              </button>
            ) : (
              <div className="bg-white border-2 border-[#273e8e] rounded-xl p-4 mt-4 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-700">Add Custom Appliance</h3>
                  <button
                    onClick={() => {
                      setShowAddAppliance(false);
                      setNewApplianceName("");
                      setNewAppliancePower("");
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Appliance Name</label>
                    <input
                      type="text"
                      value={newApplianceName}
                      onChange={(e) => setNewApplianceName(e.target.value)}
                      placeholder="e.g., Custom Device"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#273e8e] focus:ring-1 focus:ring-[#273e8e]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Wattage (W)</label>
                    <input
                      type="number"
                      value={newAppliancePower}
                      onChange={(e) => setNewAppliancePower(e.target.value)}
                      placeholder="e.g., 500"
                      min="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#273e8e] focus:ring-1 focus:ring-[#273e8e]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowAddAppliance(false);
                        setNewApplianceName("");
                        setNewAppliancePower("");
                      }}
                      className="flex-1 border-2 border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddCustomAppliance}
                      className="flex-1 bg-[#273e8e] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#1a2b6b] transition-colors"
                    >
                      Add Appliance
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Summary: Total Load, Total Energy, Inverter Rating — then Proceed → recommended bundles */}
          <div className="col-span-4">
            <div className="bg-[#273e8e] text-white rounded-2xl px-5 py-5 flex flex-col gap-4 shadow-lg">
              <h2 className="text-lg font-semibold border-b border-white/30 pb-2">Load calculation result</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-white/80 text-xs">Total Load</p>
                  <p className="text-xl font-bold">{totalLoadW.toLocaleString()} W</p>
                  <p className="text-sm text-white/90">{(totalLoadW / 1000).toFixed(3)} kW</p>
                </div>
                <div>
                  <p className="text-white/80 text-xs">Total Energy</p>
                  <p className="text-xl font-bold">{totalEnergyWh.toLocaleString()} Wh/day</p>
                  <p className="text-sm text-white/90">{totalEnergyKwh.toFixed(3)} kWh/day</p>
                </div>
                <div>
                  <p className="text-white/80 text-xs">Minimum Recommended Inverter Rating</p>
                  <p className="text-xl font-bold">{proposedRatingText}</p>
                </div>
              </div>
              <p className="text-white/80 text-xs">Click Proceed to see recommended bundles for this load.</p>
              <button
                type="button"
                onClick={handleProceed}
                className="bg-white text-[#273e8e] px-8 py-3 rounded-xl font-semibold hover:bg-gray-100 transition-colors w-full"
              >
                Proceed to recommended bundles
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile View  */}
      <div className="min-h-screen bg-[#f5f6ff] sm:hidden block pb-32">
        {/* Title and Description */}
        <div className="px-4 mb-4 pt-2">
          <h2 className="text-[14px] font-semibold text-black mb-2">
            Inverter Load Calculator
          </h2>
          <p className="text-[12px] text-gray-600">
            Add appliances and usage to see Total Load, Total Energy, and Inverter Rating. Then tap Proceed for recommended bundles.
          </p>
        </div>

        {/* Search Bar */}
        <div className="px-4 mb-4">
          <div className="flex items-center bg-white rounded-lg px-3 py-3">
            <Search className="text-gray-400 w-5 h-5 mr-2" />
            <input
              type="text"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-gray-400"
              placeholder="Search appliance"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Appliance Table — columns: Appliance | Quantity | Watts | Power (W) | Hours/Day | Watts Hours / Day */}
        <div className="px-4 mb-4">
          <div className="grid grid-cols-6 text-[10px] font-medium text-gray-600 gap-0.5 mb-1">
            <p className="col-span-1 text-left">Appliance</p>
            <p className="text-center">Qty</p>
            <p className="text-center">W</p>
            <p className="text-center">P(W)</p>
            <p className="text-center">Hrs</p>
            <p className="text-center">Wh/day</p>
          </div>
          <div className="bg-white rounded-lg border divide-y max-h-80 overflow-y-auto">
            {filteredAppliances.map((item, index) => {
              const powerW = (item.power || 0) * (item.quantity || 0);
              const hoursPerDay = item.hours ?? 0;
              const wattsHoursPerDay = powerW * hoursPerDay;
              return (
                <div
                  key={index}
                  className="grid grid-cols-6 items-center gap-0.5 py-2 text-[10px]"
                >
                  <p className="font-normal text-left pl-1 truncate" title={item.name}>{item.name}</p>
                  <div className="flex justify-center items-center gap-0.5">
                    <button
                      type="button"
                      className="bg-[#273e8e] text-white rounded p-0.5"
                      onClick={() => updateQuantity(index, item.quantity - 1)}
                    >
                      <Minus size={10} />
                    </button>
                    <span className="w-5 text-center">{item.quantity}</span>
                    <button
                      type="button"
                      className="bg-[#273e8e] text-white rounded p-0.5"
                      onClick={() => updateQuantity(index, item.quantity + 1)}
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                  <input
                    type="number"
                    value={item.power}
                    onChange={(e) => updatePower(index, e.target.value)}
                    min={0}
                    className="w-9 mx-auto px-0.5 py-0.5 text-center border rounded text-[10px] bg-gray-50"
                  />
                  <p className="text-center font-medium">{powerW}</p>
                  <input
                    type="number"
                    value={item.hours}
                    onChange={(e) =>
                      updateHours(index, parseInt(e.target.value, 10) || 0)
                    }
                    placeholder="0"
                    min={0}
                    className="w-9 mx-auto px-0.5 py-0.5 text-center border rounded text-[10px] bg-gray-50"
                  />
                  <p className="text-center font-medium">{wattsHoursPerDay}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add Custom Appliance Section */}
        <div className="px-4 mb-4">
          {!showAddAppliance ? (
            <button
              className="w-full bg-white border-2 border-[#273e8e] text-[#273e8e] rounded-lg py-3 flex items-center justify-center gap-2 hover:bg-[#273e8e] hover:text-white transition-colors"
              onClick={() => setShowAddAppliance(true)}
            >
              <Plus size={16} />
              <span className="text-sm">Add Custom Appliance</span>
            </button>
          ) : (
            <div className="bg-white border-2 border-[#273e8e] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">Add Custom Appliance</h3>
                <button
                  onClick={() => {
                    setShowAddAppliance(false);
                    setNewApplianceName("");
                    setNewAppliancePower("");
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Appliance Name</label>
                  <input
                    type="text"
                    value={newApplianceName}
                    onChange={(e) => setNewApplianceName(e.target.value)}
                    placeholder="e.g., Custom Device"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#273e8e] focus:ring-1 focus:ring-[#273e8e] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Wattage (W)</label>
                  <input
                    type="number"
                    value={newAppliancePower}
                    onChange={(e) => setNewAppliancePower(e.target.value)}
                    placeholder="e.g., 500"
                    min="1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#273e8e] focus:ring-1 focus:ring-[#273e8e] text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowAddAppliance(false);
                      setNewApplianceName("");
                      setNewAppliancePower("");
                    }}
                    className="flex-1 border-2 border-gray-300 text-gray-700 rounded-lg px-3 py-2 text-xs font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddCustomAppliance}
                    className="flex-1 bg-[#273e8e] text-white rounded-lg px-3 py-2 text-xs font-medium hover:bg-[#1a2b6b] transition-colors"
                  >
                    Add Appliance
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Total Load, Total Energy, Inverter Rating — then Proceed */}
        <div className="fixed bottom-0 left-0 right-0 bg-[#273e8e] text-white px-4 py-4 shadow-lg">
          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            <div>
              <p className="text-white/80">Total Load</p>
              <p className="font-bold">{totalLoadW.toLocaleString()} W</p>
            </div>
            <div>
              <p className="text-white/80">Total Energy</p>
              <p className="font-bold">{totalEnergyKwh.toFixed(2)} kWh/day</p>
            </div>
            <div>
              <p className="text-white/80">Minimum Recommended Inverter Rating</p>
              <p className="font-bold">{proposedRatingText}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleProceed}
            className="bg-white text-[#273e8e] w-full py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            Proceed to recommended bundles
          </button>
        </div>
      </div>
    </>
  );
};

export default InverterLoadCalculator;
