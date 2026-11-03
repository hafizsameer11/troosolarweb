import React, { useEffect, useMemo, useState, useContext } from "react";
import { Bell, ShoppingCart } from "lucide-react"; // NEW
import { useLocation, Link, useNavigate } from "react-router-dom"; // NEW
import { ContextApi } from "../Context/AppContext";

const CANDIDATE_KEYS = [
  "user",
  "auth_user",
  "current_user",
  "profile",
  "logged_in_user",
];

const readStoredUser = () => {
  for (const k of CANDIDATE_KEYS) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") return obj;
    } catch {
      /* ignore bad JSON */
    }
  }
  return null;
};

const getDisplayName = (u) => {
  if (!u) return "Guest";
  return (
    u.full_name ||
    u.name ||
    [u.first_name, u.last_name].filter(Boolean).join(" ") ||
    "User"
  );
};

const getAvatarUrl = (u) => {
  if (!u) return "";

  const avatarUrl =
    u.avatar ||
    u.profile_picture ||
    u.photo ||
    u.image_url ||
    u.avatar_url ||
    "";

  // Check if the URL contains "null" (indicating no actual image)
  if (avatarUrl && (avatarUrl.includes("null") || avatarUrl === "blob:http")) {
    return "";
  }

  return avatarUrl;
};

const getInitials = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "U";
};

const TopNavbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [bellAnimating, setBellAnimating] = useState(false);
  const { cartCount } = useContext(ContextApi);

  useEffect(() => {
    setUser(readStoredUser());
  }, []);

  const name = useMemo(() => getDisplayName(user), [user]);
  const avatar = useMemo(() => getAvatarUrl(user), [user]);
  const initials = useMemo(() => getInitials(name), [name]);

  // Keep your existing background rule
  const changeBg =
    location.pathname.includes("/tools") ||
    location.pathname.includes("/solar-bundles") ||
    location.pathname.includes("/homePage") ||
    location.pathname.includes("/product/"); // covers /product/:id

  const showCart = useMemo(() => {
    // Pages where the Cart icon should be visible (EDIT THIS LIST as needed)
    const CART_PATH_PATTERNS = [
      "/product/", // product detail pages
      "/homePage", // home page
      "/solar-bundles", // bundles
      "/tools", // add/remove as you wish
      // "/shop", "/catalog", "/category/"
    ];
    return CART_PATH_PATTERNS.some((p) => location.pathname.includes(p));
  }, [location.pathname]);

  const handleNotificationsClick = () => {
    // Trigger animation
    setBellAnimating(true);
    setTimeout(() => {
      setBellAnimating(false);
    }, 600); // Animation duration
    
    navigate("/more?section=notifications");
  };

  return (
    <div>
      <header
        className={`flex gap-3 items-center h-[90px] justify-between px-5 sm:pr-10 py-5 ${
          changeBg ? "bg-[#273e8e]" : "bg-white"
        }`}
      >
        <a
          href="https://troosolar.com/"
          target="_blank"
          rel="noopener noreferrer"
          className={`text-sm sm:text-base font-semibold underline-offset-2 hover:underline whitespace-nowrap ${
            changeBg ? "text-white" : "text-[#273e8e]"
          }`}
        >
          Visit Website
        </a>

        <div className="flex gap-3 items-center">
        {/* Notifications */}
        <button
          onClick={handleNotificationsClick}
          className={`rounded-lg flex justify-center items-center shadow-md h-10 w-10 transition-colors relative ${
            changeBg ? "bg-[#ffffff]" : "bg-white"
          }`}
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell 
            size={24} 
            className={`transition-all duration-300 ${
              bellAnimating 
                ? "text-yellow-500 animate-bell-dangle" 
                : changeBg 
                ? "text-[#273e8e]" 
                : "text-gray-700"
            }`}
            style={{
              transformOrigin: 'top center',
            }}
          />
        </button>

        {/* Cart (only on selected pages) */}
        {showCart && (
          <Link
            to="/cart"
            className={`relative rounded-lg flex justify-center items-center shadow-md h-10 w-10 transition-colors ${
              changeBg ? "bg-[#ffffff]" : "bg-white"
            }`}
            aria-label="Cart"
            title="Cart"
          >
            <ShoppingCart size={24} />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
        )}

        {/* Avatar */}
        <div className="bg-[#e9e9e9] h-11 w-11 rounded-full overflow-hidden flex items-center justify-center">
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <p className="text-[30px] text-[#909090] font-medium">{initials}</p>
          )}
        </div>

        {/* Name */}
        <p
          className={`${
            changeBg ? "text-white" : "text-[#000000]"
          } text-lg hidden sm:block`}
        >
          {name}
        </p>
        </div>
      </header>
    </div>
  );
};

export default TopNavbar;
