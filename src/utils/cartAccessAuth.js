/** Cart custom-order deep links: /cart?token=…&type=buy_now|bnpl (and /bnpl?…). */
export const isCartOrderDeepLink = (path) => {
  if (!path || typeof path !== "string") return false;
  return (
    /[?&]token=/.test(path) &&
    /[?&]type=(buy_now|bnpl)(?:&|$|[?])/.test(path)
  );
};

/** Store Sanctum session returned by GET /api/cart/access/{token}. */
export const persistSessionFromCartAccess = (payload) => {
  if (!payload?.access_token) return false;

  localStorage.setItem("access_token", payload.access_token);

  if (payload.user) {
    const user = payload.user;
    const firstName = user.first_name ?? "";
    const capitalizedFirstName =
      firstName.charAt(0).toUpperCase() + firstName.slice(1);

    const updatedUser = {
      ...user,
      first_name: capitalizedFirstName,
      profile_picture: user.profile_picture
        ? `https://api.troosolar.com/public/users/${user.profile_picture}`
        : user.profile_picture,
    };
    localStorage.setItem("user", JSON.stringify(updatedUser));
  }

  return true;
};
