import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import API from "../config/api.config";
import { assets } from "../assets/data";
import { Input } from "../Component/Input";
import Loading from "../Component/Loading";
import {
  authSwitchPath,
  getSafeReturnPath,
} from "../utils/authRedirect";
import { isCartOrderDeepLink } from "../utils/cartAccessAuth";

const Auth = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isLogin = location.pathname === "/login";

  const [formData, setFormData] = useState({
    firstName: "",
    surname: "",
    email: "",
    phone: "",
    bvn: "",
    password: "",
    code: "",
  });

  const [hidePassword, setHidePassword] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const returnPath = useMemo(
    () => getSafeReturnPath(location.search),
    [location.search]
  );
  const registerPath = authSwitchPath("/register", location.search);
  const loginPath = authSwitchPath("/login", location.search);

  useEffect(() => {
    if (isLogin) return;
    const params = new URLSearchParams(location.search);
    const code = params.get("referral_code");
    if (code) {
      const trimmed = decodeURIComponent(code).trim();
      if (trimmed) {
        setFormData((prev) => ({ ...prev, code: trimmed }));
      }
    }
  }, [location.search, isLogin]);

  // Email / deep links: if already signed in, skip the login form and go to ?return=
  // Cart order links handle auth on /cart or /bnpl — do not bounce logged-in visitors in a loop.
  useEffect(() => {
    if (!isLogin) return;
    const token = localStorage.getItem("access_token");
    if (!token || !returnPath) return;
    if (isCartOrderDeepLink(returnPath)) return;
    navigate(returnPath, { replace: true });
  }, [isLogin, returnPath, navigate]);

  // Function to check if all required fields are filled
  const isFormValid = () => {
    if (isLogin) {
      // For login, only email and password are required
      return formData.email.trim() !== "" && formData.password.trim() !== "";
    } else {
      // For registration, all fields except referral code and BVN are required
      return (
        formData.firstName.trim() !== "" &&
        formData.surname.trim() !== "" &&
        formData.email.trim() !== "" &&
        formData.phone.trim() !== "" &&
        formData.password.trim() !== ""
      );
    }
  };

  const handleChange = (e) => {
    const { id, name, value } = e.target;
    const key = id || name; // ✅ fallback for mobile/custom inputs
    if (!key) return;
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!isLogin) {
        // REGISTER
        const payload = {
          first_name: formData.firstName?.trim(),
          sur_name: formData.surname?.trim(),
          email: formData.email?.trim(),
          password: formData.password,
          phone: formData.phone?.trim(),
          // BVN removed - no longer required for registration
          referral_code: formData.code ? String(formData.code).trim() : null,
        };

        const { data } = await axios.post(API.REGISTER, payload, {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        });

        navigate("/verification", {
          state: {
            email: payload.email,
            otp: data?.data?.otp,
            userId: data?.data?.id,
            message: data?.message,
          },
        });
      } else {
        // LOGIN
        const payload = {
          email: formData.email?.trim(),
          password: formData.password,
        };

        const { data } = await axios.post(API.LOGIN, payload, {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        });

        // Try common response shapes
        const token =
          data?.token ||
          data?.access_token ||
          data?.data?.token ||
          data?.data?.access_token ||
          null;

        const user = data?.user || data?.data?.user || null;

        if (token) localStorage.setItem("access_token", token);

        if (user) {
          // Capitalize the first letter of first_name
          const capitalizedFirstName =
            user.first_name.charAt(0).toUpperCase() + user.first_name.slice(1);

          // Construct the new profile picture URL based on the user's ID
          const updatedUser = {
            ...user,
            first_name: capitalizedFirstName,
            profile_picture: `https://api.troosolar.com/public/users/${user.profile_picture}`,
          };

          // Store the updated user object in localStorage
          localStorage.setItem("user", JSON.stringify(updatedUser));
        }

        // Go somewhere after login — honor ?return= from custom order / cart links
        navigate(returnPath || "/");
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        (isLogin
          ? "Login failed. Please check your credentials."
          : "Registration failed. Please try again.");
      setError(msg);
      console.error("Auth error:", err?.response?.data || err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {loading && (
        <Loading 
          fullScreen={true} 
          message={isLogin ? "Logging in..." : "Creating your account..."}
          progress={null}
        />
      )}
      {/* Desktop */}
      <div className="w-full h-screen sm:flex hidden overflow-clip">
        <div className="relative w-1/2 overflow-hidden">
          <img
            src={assets.loginImage}
            alt="Login Visual"
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute bottom-24 left-12 text-white w-[80%]">
            <p className="text-lg leading-relaxed">
              Providing affordable, sustainable and reliable <br />
              solar energy solutions for millions <br />
              of Nigerians
            </p>
          </div>
          <div className="absolute bottom-6 left-12 flex gap-4">
            <img src={assets.insta} alt="Instagram" className="h-10 w-10" />
            <img src={assets.whatsApp} alt="WhatsApp" className="h-10 w-10" />
            <img src={assets.twitter} alt="Twitter" className="h-10 w-10" />
            <img src={assets.yt} alt="YouTube" className="h-10 w-10" />
          </div>
        </div>

        <div className="w-1/2 bg-[#f5f7ff] flex justify-center items-center ml-[-20px]">
          <div className="w-[90%] max-w-[600px] p-6 bg-white rounded-2xl shadow-lg h-[100%] overflow-y-auto">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="text-center">
                <img
                  src={assets.fullLogo}
                  alt="Logo"
                  className="w-[200px] mx-auto mb-8"
                  loading="lazy"
                />
                <h2 className="text-3xl font-semibold">
                  {isLogin ? "Login" : "Create an Account"}
                </h2>
                <p className="text-sm text-gray-600 mt-2">
                  {isLogin
                    ? returnPath
                      ? "Login to continue to your order"
                      : "Login to access your account"
                    : "Provide your personal information to help us know you better"}
                </p>
              </div>

              <div className="space-y-4">
                {!isLogin && (
                  <>
                    <Input
                      id="firstName"
                      name="firstName" // ✅ ensure event key exists
                      label="First Name"
                      placeholder="First Name"
                      value={formData.firstName}
                      onChange={handleChange}
                    />
                    <Input
                      id="surname"
                      name="surname" // ✅
                      label="Surname"
                      placeholder="Surname"
                      value={formData.surname}
                      onChange={handleChange}
                    />
                  </>
                )}

                <Input
                  id="email"
                  name="email" // ✅
                  label="Email"
                  placeholder="Enter your email address"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                />

                {/* ✅ Show password on desktop (moved out of sm:hidden) */}
                <Input
                  id="password"
                  name="password" // ✅
                  label="Password"
                  placeholder="Enter your password"
                  isPassword={true}
                  hidePassword={hidePassword}
                  setHidePassword={setHidePassword}
                  value={formData.password}
                  onChange={handleChange}
                />

                {!isLogin && (
                  <>
                    {/* ✅ Missing on desktop before — required by validation */}
                    <Input
                      id="phone"
                      name="phone"
                      label="Phone Number"
                      placeholder="Phone Number"
                      type="tel"
                      value={formData.phone}
                      onChange={handleChange}
                    />
                    <Input
                      id="code"
                      name="code" // ✅
                      label="Referral Code (Optional)"
                      placeholder="Referral Code"
                      type="text"
                      value={formData.code}
                      onChange={handleChange}
                    />
                  </>
                )}
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}

             

              <button
                type="submit"
                disabled={loading || !isFormValid()}
                className="w-full bg-[#273e8e] text-white py-3 rounded-lg transition duration-200 disabled:opacity-60"
              >
                {loading
                  ? isLogin
                    ? "Logging in..."
                    : "Creating..."
                  : isLogin
                  ? "Login"
                  : "Create Account"}
              </button>
<div className="flex justify-between">
              <p className="text-start text-sm">
                {isLogin
                  ? "Don't have an account?"
                  : "I already have an account"}
              </p>
              {isLogin && (
                <Link
                  to="/forgot-password"
                  className="block text-end text-sm font-bold text-[#273e8e] hover:underline mb-2"
                >
                  Forgotten password?
                </Link>
              )}
              </div>
              <Link
                to={isLogin ? registerPath : loginPath}
                className="block text-center w-full bg-[#e8a91d] text-white py-3 rounded-lg transition duration-200"
              >
                {isLogin ? "Register" : "Login"}
              </Link>
            </form>
          </div>
        </div>
      </div>

      <div className="w-full min-h-screen sm:hidden block relative">
        <img
          src={assets.loginImage}
          className="w-full h-[40vh] object-cover"
          alt="Mobile Background"
        />

        <div className="bg-[#273e8e] absolute top-[31vh] w-full rounded-t-4xl shadow-md p-6 text-center mb-6">
          <img src={assets.fullLogoMobile} alt="Logo" className="mx-auto mb-3 w-[200px]" />
          
          <h1 className="text-2xl font-bold text-white">
            {isLogin ? "Login" : "Create an account"}
          </h1>
          <p className="text-[10px] text-white mt-3">
            {isLogin
              ? returnPath
                ? "Login to continue to your order"
                : "Login to access your account"
              : "Provide your personal information to help us know you better"}
          </p>
        </div>

        <form className="space-y-4 p-4 mt-24 py-9" onSubmit={handleSubmit}>
          {!isLogin && (
            <>
              <Input
                id="firstName"
                name="firstName" // ✅
                label="First Name"
                placeholder="First Name"
                value={formData.firstName}
                onChange={handleChange}
                isMobile={true}
              />
              <Input
                id="surname"
                name="surname" // ✅
                label="Surname"
                placeholder="Surname"
                value={formData.surname}
                onChange={handleChange}
                isMobile={true}
              />
            </>
          )}

          <Input
            id="email"
            name="email" // ✅
            label="Email Address"
            placeholder="Enter your email address"
            type="email"
            value={formData.email}
            onChange={handleChange}
            isMobile={true}
          />

          {!isLogin && (
            <>
              <Input
                id="phone"
                name="phone" // ✅
                label="Phone Number"
                placeholder="Phone Number"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                isMobile={true}
              />
            </>
          )}

          <Input
            id="password"
            name="password" // ✅
            label="Password"
            placeholder="Enter your password"
            isPassword={true}
            hidePassword={hidePassword}
            setHidePassword={setHidePassword}
            value={formData.password}
            onChange={handleChange}
            isMobile={true}
          />

          {isLogin && (
            <Link
              to="/forgot-password"
              className="block text-end text-sm font-bold text-[#273e8e] hover:underline mb-2"
            >
              Forgotten password?
            </Link>
          )}

          {!isLogin && (
            <Input
              id="code"
              name="code" // ✅
              label="Referral Code (Optional)"
              placeholder="Enter your referral code"
              type="text"
              value={formData.code}
              onChange={handleChange}
              isMobile={true}
            />
          )}

          <button
            type="submit"
            disabled={loading || !isFormValid()}
            className="w-full bg-[#273e8e] text-white py-3 rounded-full disabled:opacity-60"
          >
            {isLogin ? "Login" : "Create Account"}
          </button>

          <p className={isLogin ? "text-start text-sm" : "text-start text-sm"}>
            {isLogin ? "I don't have an account" : "I already have an account"}
          </p>
          <Link
            to={isLogin ? registerPath : loginPath}
            className="block text-center w-full bg-[#e8a91d] text-white py-3 rounded-lg transition duration-200"
          >
            {isLogin ? "Register" : "Login"}
          </Link>
        </form>
      </div>
    </>
  );
};

export default Auth;
