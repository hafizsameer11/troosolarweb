import React, { useMemo, useState } from "react";
import { Minus, Plus, Search } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import SideBar from "../Component/SideBar";
import TopNavbar from "../Component/TopNavbar";
import { withShopSource } from "../utils/shopSource";

const SolarBuilder = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const bundleId = searchParams.get("bundleId");
  const editMode = searchParams.get("editMode");
  const fromBundles = searchParams.get("fromBundles");
  const recommend = searchParams.get("recommend");

  // Handle go back navigation
  const handleGoBack = () => {
    if (bundleId) {
      // If coming from a bundle detail page, go back to that bundle
      navigate(withShopSource(`/productBundle/details/${bundleId}`));
    } else if (fromBundles || recommend) {
      // If coming from bundles or recommendations, go back to solar bundles
      navigate("/solar-bundles");
    } else {
      // Otherwise, use browser history or go to home
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate("/");
      }
    }
  };

  // Seed appliances (tweak powers as needed)
  const applianceList = [
    { name: "Ceiling Fan", power: 70 },
    { name: "Laptop", power: 70 },
    { name: "LED Bulbs", power: 70 },
    { name: "Fridge", power: 70 },
    { name: "Washing Machine", power: 70 },
    { name: "Rech Fan", power: 70 },
    { name: "OX Fan", power: 70 },
    { name: '65" TV', power: 70 },
    { name: "CCTV Camera", power: 70 },
    { name: "Desktop", power: 70 },
  ];

  // Small helpers for the calc list rows
  const labelStyle = "text-gray-600 text-[16px]";
  const valueStyle = "text-[16px]";
  const DetailRow = ({ label, value }) => (
    <>
      <div className="flex justify-between">
        <span className={labelStyle}>{label}</span>
        <span className={valueStyle}>{value}</span>
      </div>
      <hr className="text-gray-200" />
    </>
  );

  // State — default hours 1 so values aren’t zero at start
  const [appliances, setAppliances] = useState(
    applianceList.map((a) => ({ ...a, quantity: 2, hours: 1 }))
  );
  const [searchTerm, setSearchTerm] = useState("");

  // ---- Add New Appliance state (desktop + mobile share) ----
  const [showAddFormDesktop, setShowAddFormDesktop] = useState(false);
  const [showAddFormMobile, setShowAddFormMobile] = useState(false);
  const [newAppliance, setNewAppliance] = useState({
    name: "",
    power: "",
    quantity: "1",
    hours: "1",
  });
  const resetNewAppliance = () =>
    setNewAppliance({ name: "", power: "", quantity: "1", hours: "1" });

  const validateAndAdd = () => {
    const name = newAppliance.name.trim();
    const power = Number(newAppliance.power);
    const quantity = Math.max(0, parseInt(newAppliance.quantity || "0", 10));
    const hours = Math.max(0, parseInt(newAppliance.hours || "0", 10));

    if (!name) return alert("Please enter an appliance name.");
    if (!Number.isFinite(power) || power <= 0)
      return alert("Please enter a valid wattage (> 0).");
    if (!Number.isFinite(quantity) || quantity <= 0)
      return alert("Please enter a valid quantity (> 0).");
    if (!Number.isFinite(hours))
      return alert("Please enter valid hours (≥ 0).");

    setAppliances((prev) => [
      ...prev,
      { name, power, quantity, hours },
    ]);

    resetNewAppliance();
    setShowAddFormDesktop(false);
    setShowAddFormMobile(false);
  };

  // Assumptions for sizing
  const panelWatt = 200;      // W per panel
  const sunHours = 4;         // peak-sun-hours/day
  const systemVoltage = 24;   // 12/24/48V
  const derate = 0.75;        // system losses
  const powerFactor = 0.8;    // inverter PF
  const maxPerController = 60;

  const roundUp = (n, step = 1) => Math.ceil(n / step) * step;
  const nextStandardAmps = (i) => {
    const std = [10, 15, 20, 30, 40, 50, 60, 80, 100, 125, 150, 200];
    return std.find((a) => a >= i) ?? std[std.length - 1];
  };

  // Filter (for visible list only)
  const filteredAppliances = useMemo(
    () =>
      appliances.filter((appliance) =>
        appliance.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [appliances, searchTerm]
  );

  // === Calculations ===
  // Peak load (instantaneous) — used for q
  const peakLoadW = useMemo(
    () => appliances.reduce((sum, a) => sum + a.power * a.quantity, 0),
    [appliances]
  );

  // Your “Total Load” box from earlier (power * qty * (hrs||1))
  const totalOutput = useMemo(
    () =>
      appliances.reduce(
        (total, a) => total + a.power * a.quantity * (a.hours || 1),
        0
      ),
    [appliances]
  );

  // Daily energy (Wh)
  const dailyWh = useMemo(
    () =>
      appliances.reduce(
        (sum, a) => sum + a.power * a.quantity * (a.hours || 0),
        0
      ),
    [appliances]
  );

  // Inverter VA from peak load
  const inverterVA = useMemo(
    () => roundUp(peakLoadW / powerFactor, 100),
    [peakLoadW]
  );

  // PV array sizing from energy
  const requiredArrayWp = useMemo(
    () => (dailyWh > 0 ? Math.ceil(dailyWh / (sunHours * derate)) : 0),
    [dailyWh]
  );
  const panelQty = useMemo(
    () => (requiredArrayWp > 0 ? Math.ceil(requiredArrayWp / panelWatt) : 0),
    [requiredArrayWp]
  );
  const panelBankkW = useMemo(
    () => (panelQty * panelWatt) / 1000,
    [panelQty]
  );

  // Charge controller sizing
  const arrayCurrentA = useMemo(
    () => (systemVoltage > 0 ? (panelQty * panelWatt) / systemVoltage : 0),
    [panelQty]
  );
  const controllerNeededA = useMemo(() => arrayCurrentA * 1.25, [arrayCurrentA]);
  const singleControllerA = useMemo(
    () => nextStandardAmps(controllerNeededA),
    [controllerNeededA]
  );
  const controllerQty = useMemo(
    () =>
      controllerNeededA <= maxPerController
        ? 1
        : Math.ceil(controllerNeededA / maxPerController),
    [controllerNeededA]
  );
  const controllerShownA = controllerQty === 1 ? singleControllerA : maxPerController;

  // Rack estimate
  const panelRackQty = Math.ceil(panelQty / 2);

  // Mutators (respect filtered indexing)
  const updateQuantity = (index, newQuantity) => {
    const name = filteredAppliances[index].name;
    setAppliances((prev) =>
      prev.map((p) =>
        p.name === name ? { ...p, quantity: Math.max(0, newQuantity) } : p
      )
    );
  };
  const updateHours = (index, hoursVal) => {
    const name = filteredAppliances[index].name;
    const hoursNum = Math.max(0, Number(hoursVal) || 0);
    setAppliances((prev) =>
      prev.map((p) => (p.name === name ? { ...p, hours: hoursNum } : p))
    );
  };

  // Proceed -> /solar-bundles?q=<peakLoadW>
  const handleProceed = () => {
    const q = Math.max(0, Math.round(peakLoadW));
    navigate(`/solar-bundles?q=${q}`);
  };

  return (
    <div>
      <div className="flex min-h-screen w-full">
        <SideBar />

        {/* Main Content */}
        <div className="w-full sm:w-[calc(100%-250px)]">
          {/* Topbar (keep as-is) */}
          <div className="sm:block hidden">
            <TopNavbar />
          </div>

          {/* ===== Desktop View ===== */}
          <div className="hidden sm:block min-h-screen bg-[#f5f6ff] px-8 py-8">
            <h1 className="text-2xl font-medium">Solar Panel Calculator</h1>
            <p className="text-xs text-gray-500 mt-3 w-[60%]">
              A solar panel calculator estimates the number and size of solar panels needed based on
              your energy usage. It helps you design an efficient solar system for your homes,
              businesses, or off-grid setups.
            </p>

            <button
              onClick={handleGoBack}
              className="text-[#273e8e] text-sm inline-block mt-3 hover:underline cursor-pointer"
            >
              Go back
            </button>

            <div className="grid grid-cols-12 gap-6 mt-4">
              {/* Left column: table + add + calculations + proceed */}
              <div className="col-span-7 space-y-4">
                {/* Search */}
                <div className="flex items-center w-full border-2 border-gray-300 rounded-xl bg-white px-4 py-3">
                  <Search className="text-gray-400 w-6 h-6 mr-3" />
                  <input
                    type="text"
                    className="w-full outline-none text-[16px] bg-transparent placeholder:text-gray-400"
                    placeholder="Search appliance"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                {/* Headers */}
                <div className="grid grid-cols-4 font-medium text-gray-700 text-center">
                  <p>Appliance</p>
                  <p>Quantity</p>
                  <p>Total power</p>
                  <p>Usage(hrs)</p>
                </div>

                {/* Appliance table */}
                <div className="rounded-2xl border bg-white p-4 divide-y">
                  {filteredAppliances.map((item, index) => {
                    const totalPower = item.power * item.quantity;
                    return (
                      <div
                        key={item.name + index}
                        className="grid grid-cols-4 items-center text-center py-3 text-sm"
                      >
                        <div className="flex justify-center">
                          <button className="bg-[#273e8e] text-white rounded-full px-3 py-1 text-xs font-medium">
                            {item.name}
                          </button>
                        </div>

                        <div className="flex justify-center items-center gap-2">
                          <button
                            className="bg-[#273e8e] text-white rounded p-1.5 cursor-pointer"
                            onClick={() => updateQuantity(index, item.quantity - 1)}
                          >
                            <Minus size={16} />
                          </button>
                          <span className="w-6 text-center">{item.quantity}</span>
                          <button
                            className="bg-[#273e8e] text-white rounded p-1.5 cursor-pointer"
                            onClick={() => updateQuantity(index, item.quantity + 1)}
                          >
                            <Plus size={16} />
                          </button>
                        </div>

                        <p className="font-medium">{totalPower}w</p>

                        <input
                          type="number"
                          value={item.hours}
                          onChange={(e) => updateHours(index, e.target.value)}
                          onBlur={(e) => updateHours(index, e.target.value)}
                          placeholder="hrs"
                          min="0"
                          step="1"
                          className="w-16 mx-auto px-2 py-1 text-center border rounded bg-white outline-none focus:border-[#273e8e] focus:ring-1 focus:ring-[#273e8e]"
                        />
                      </div>
                    );
                  })}

                  {/* Add new appliance — DESKTOP */}
                  {!showAddFormDesktop ? (
                    <div className="flex items-center justify-start gap-2 text-gray-700 text-sm pt-3">
                      <button
                        onClick={() => {
                          resetNewAppliance();
                          setShowAddFormDesktop(true);
                        }}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md px-3 py-1 transition cursor-pointer"
                      >
                        + Add New Appliance
                      </button>
                    </div>
                  ) : (
                    <div className="pt-4">
                      <div className="grid grid-cols-12 gap-3 items-end">
                        <div className="col-span-4">
                          <label className="block text-xs text-gray-600 mb-1">Appliance name</label>
                          <input
                            type="text"
                            value={newAppliance.name}
                            onChange={(e) => setNewAppliance((p) => ({ ...p, name: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 bg-white outline-none"
                            placeholder="e.g. Blender"
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-xs text-gray-600 mb-1">Wattage (W)</label>
                          <input
                            type="number"
                            value={newAppliance.power}
                            onChange={(e) => setNewAppliance((p) => ({ ...p, power: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 bg-white outline-none"
                            placeholder="e.g. 300"
                            min="1"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-600 mb-1">Qty</label>
                          <input
                            type="number"
                            value={newAppliance.quantity}
                            onChange={(e) => setNewAppliance((p) => ({ ...p, quantity: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 bg-white outline-none"
                            min="1"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-600 mb-1">Hours</label>
                          <input
                            type="number"
                            value={newAppliance.hours}
                            onChange={(e) => setNewAppliance((p) => ({ ...p, hours: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 bg-white outline-none"
                            min="0"
                          />
                        </div>
                        <div className="col-span-12 flex gap-2">
                          <button
                            onClick={validateAndAdd}
                            className="bg-[#273e8e] text-white rounded-lg px-4 py-2 text-sm"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => {
                              resetNewAppliance();
                              setShowAddFormDesktop(false);
                            }}
                            className="bg-gray-200 text-gray-800 rounded-lg px-4 py-2 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Calculations card (matches screenshot style) */}
                <div className="flex flex-col bg-amber-100/50 p-3 px-4 gap-3 text-sm rounded-2xl border-[2px] border-dashed border-[#E8A91D]">
                  <h1 className="py-2 font-medium text-lg">Calculations</h1>
                  <DetailRow label="Solar Panel Capacity" value={`${panelWatt}w`} />
                  <DetailRow label="Panel Quantity" value={`${panelQty}`} />
                  <DetailRow label="Charge Controller" value={`${controllerShownA}A-${systemVoltage}V`} />
                  <DetailRow label="Charge Controller qty" value={`${controllerQty}`} />
                  <DetailRow label="Panel Bank (kwatts)" value={`${panelBankkW.toFixed(0)}`} />
                  <div className="flex justify-between">
                    <span className={labelStyle}>Panel Rack</span>
                    <span className={valueStyle}>{panelRackQty}</span>
                  </div>
                </div>

                {/* Proceed button -> /solar-bundles?q=<peakLoadW> */}
                <button
                  onClick={handleProceed}
                  className="bg-[#273e8e] text-white rounded-full px-6 text-sm w-full py-4"
                >
                  Proceed
                </button>
              </div>

              {/* Right column: totals summary */}
              <div className="col-span-5">
                <div className="bg-[#273e8e] w-full text-white rounded-2xl px-6 py-6 flex justify-between items-center gap-6 shadow-lg">
                  {/* Total Load (Peak) */}
                  <div className="w-1/2">
                    <h2 className="text-lg mb-2">Total Load</h2>
                    <div className="bg-white h-[60px] w-full rounded-xl flex justify-center items-center gap-2 text-[#273e8e] shadow-inner">
                      <span className="text-4xl font-bold">{peakLoadW.toLocaleString()}</span>
                      <span className="text-sm self-end pb-2">Watts</span>
                    </div>
                  </div>

                  {/* Inverter Rating */}
                  <div className="w-1/2">
                    <h2 className="text-lg mb-2">Inverter Rating</h2>
                    <div className="bg-white h-[60px] w-full rounded-xl flex justify-center items-center gap-2 text-[#273e8e] shadow-inner">
                      <span className="text-4xl font-bold">{inverterVA.toLocaleString()}</span>
                      <span className="text-sm self-end pb-2">VA</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== Mobile View ===== */}
          <div className="sm:hidden block min-h-screen bg-[#f5f6ff] pb-28 px-4 pt-4">
            <h1 className="text-lg font-semibold">Solar Panel Calculator</h1>
            <p className="text-xs text-gray-600 mt-2">
              Estimate the panels you need based on your energy usage.
            </p>

            {/* Search */}
            <div className="flex items-center w-full border border-gray-300 rounded-lg bg-white px-3 py-2 mt-4">
              <Search className="text-gray-400 w-5 h-5 mr-2" />
              <input
                type="text"
                className="w-full outline-none text-sm bg-transparent placeholder:text-gray-400"
                placeholder="Search appliance"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Headers */}
            <div className="grid grid-cols-4 text-[10px] font-medium text-gray-600 text-center mt-3 mb-1">
              <p>Appliance</p>
              <p>Qty</p>
              <p>Total</p>
              <p>Hrs</p>
            </div>

            {/* Items */}
            <div className="bg-white rounded-lg border divide-y max-h-80 overflow-y-auto">
              {filteredAppliances.map((item, index) => {
                const totalPower = item.power * item.quantity;
                return (
                  <div
                    key={item.name + index}
                    className="grid grid-cols-4 items-center text-center py-2 text-[10px]"
                  >
                    <div className="flex justify-center">
                      <button className="bg-[#273e8e] text-white rounded-full px-2 py-1 text-[9px] font-medium">
                        {item.name}
                      </button>
                    </div>

                    <div className="flex justify-center items-center gap-1">
                      <button
                        className="bg-[#273e8e] text-white rounded p-1 cursor-pointer"
                        onClick={() => updateQuantity(index, item.quantity - 1)}
                      >
                        <Plus size={10} className="rotate-45" /> {/* minus-esque */}
                      </button>
                      <span className="w-5 text-center font-medium">{item.quantity}</span>
                      <button
                        className="bg-[#273e8e] text-white rounded p-1 cursor-pointer"
                        onClick={() => updateQuantity(index, item.quantity + 1)}
                      >
                        <Plus size={10} />
                      </button>
                    </div>

                    <p className="font-medium">{totalPower}w</p>

                    <input
                      type="number"
                      value={item.hours}
                      onChange={(e) => updateHours(index, e.target.value)}
                      className="w-12 mx-auto px-1 py-1 text-center border rounded bg-gray-100"
                    />
                  </div>
                );
              })}
            </div>

            {/* Add new appliance — MOBILE */}
            {!showAddFormMobile ? (
              <div className="mt-3">
                <button
                  onClick={() => {
                    resetNewAppliance();
                    setShowAddFormMobile(true);
                  }}
                  className="w-full bg-white border border-gray-300 rounded-lg py-2 flex items-center justify-center gap-2 text-gray-700"
                >
                  <span className="text-sm font-medium">+ Add New Appliance</span>
                </button>
              </div>
            ) : (
              <div className="bg-white border rounded-lg p-3 mt-3 space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Appliance name</label>
                  <input
                    type="text"
                    value={newAppliance.name}
                    onChange={(e) => setNewAppliance((p) => ({ ...p, name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 bg-white outline-none"
                    placeholder="e.g. Blender"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Watts</label>
                    <input
                      type="number"
                      value={newAppliance.power}
                      onChange={(e) => setNewAppliance((p) => ({ ...p, power: e.target.value }))}
                      className="w-full border rounded-lg px-2 py-2 bg-white outline-none"
                      placeholder="300"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Qty</label>
                    <input
                      type="number"
                      value={newAppliance.quantity}
                      onChange={(e) => setNewAppliance((p) => ({ ...p, quantity: e.target.value }))}
                      className="w-full border rounded-lg px-2 py-2 bg-white outline-none"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Hrs</label>
                    <input
                      type="number"
                      value={newAppliance.hours}
                      onChange={(e) => setNewAppliance((p) => ({ ...p, hours: e.target.value }))}
                      className="w-full border rounded-lg px-2 py-2 bg-white outline-none"
                      min="0"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={validateAndAdd}
                    className="flex-1 bg-[#273e8e] text-white rounded-lg py-2 text-sm"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      resetNewAppliance();
                      setShowAddFormMobile(false);
                    }}
                    className="flex-1 bg-gray-200 text-gray-800 rounded-lg py-2 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Calculations (compact) */}
            <div className="bg-yellow-50 border border-yellow-300 border-dotted rounded-lg p-4 shadow-sm mt-4">
              <p className="text-xs text-black font-semibold mb-3">Calculations</p>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-700">Solar Panel Capacity</span>
                  <span className="font-medium">{panelWatt}w</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Panel Quantity</span>
                  <span className="font-medium">{panelQty}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Charge Controller</span>
                  <span className="font-medium">
                    {controllerShownA}A-{systemVoltage}V
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Charge Controller qty</span>
                  <span className="font-medium">{controllerQty}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Panel Bank (kwatts)</span>
                  <span className="font-medium">{panelBankkW.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700">Panel Rack</span>
                  <span className="font-medium">{panelRackQty}</span>
                </div>
              </div>
            </div>

            {/* Summary + Proceed */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-white rounded-xl shadow-inner flex flex-col items-center justify-center p-3 border">
                <span className="text-xs text-gray-600 mb-1">Total Load</span>
                <div className="text-[#273e8e]">
                  <span className="text-2xl font-bold">{peakLoadW.toLocaleString()}</span>
                  <span className="text-xs ml-1">Watts</span>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-inner flex flex-col items-center justify-center p-3 border">
                <span className="text-xs text-gray-600 mb-1">Inverter Rating</span>
                <div className="text-[#273e8e]">
                  <span className="text-2xl font-bold">{inverterVA.toLocaleString()}</span>
                  <span className="text-xs ml-1">VA</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleProceed}
              className="fixed bottom-4 left-4 right-4 bg-[#273e8e] text-white rounded-lg py-3 text-sm font-medium"
            >
              Proceed
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SolarBuilder;
