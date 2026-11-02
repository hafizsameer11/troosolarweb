import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

const LinkComp = ({
  name,
  link,
  sub = [],
  isActiveCheck,
  icon,
  onClick,
  menuStatus,
  external = false,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(isActiveCheck);
  const isExternal =
    external || /^https?:\/\//i.test(String(link || ""));

  useEffect(() => {
    if (isExternal) {
      setIsActive(false);
      return;
    }
    const currentPath = location.pathname;
    const basePath = currentPath.split("/")[1];
    const baseLink = link.split("/")[1];

    const isActiveNow =
      basePath === baseLink ||
      sub.some(
        (item) =>
          currentPath === item.link ||
          currentPath.split("/")[1] === item.link.split("/")[1]
      );

    setIsActive(isActiveNow);
  }, [location.pathname, link, sub, isExternal]);

  const handleClick = (e) => {
    onClick?.(e);
    if (isExternal) return;
    // Re-clicking Solar Store while already on the shop should clear filters.
    if (
      link === "/homePage" &&
      (location.pathname === "/homePage" ||
        location.pathname.startsWith("/homePage/"))
    ) {
      e.preventDefault();
      navigate("/homePage", {
        replace: true,
        state: { resetShop: Date.now() },
      });
    }
  };

  const className = `group flex items-center py-3 rounded-md transition-all duration-200 mx-4 relative ${
    isActive
      ? "bg-white text-[#273E8E]"
      : "text-gray-400 hover:bg-white hover:text-[#273E8E]"
  }`;

  const content = (
    <>
      <img
        src={icon}
        alt={`${name || "icon"}`}
        className={`${
          name === "Cart" || name === "More" || name === "Visit Website"
            ? "w-7 h-7 ms-2"
            : "w-10 h-10"
        } ${isActive ? "invert" : "group-hover:invert"}`}
      />
      {!menuStatus && <span className="ml-3 font-medium">{name}</span>}

      {/* Left Highlight Bar */}
      <div
        className={`absolute right-1 top-1/2 h-[40%] w-1 bg-[#273E8E] rounded transform -translate-y-1/2 ${
          isActive ? "block" : "hidden group-hover:block"
        }`}
      />
    </>
  );

  return (
    <div className="relative">
      {isExternal ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          className={className}
        >
          {content}
        </a>
      ) : (
        <Link to={link} onClick={handleClick} className={className}>
          {content}
        </Link>
      )}
    </div>
  );
};

export default LinkComp;
