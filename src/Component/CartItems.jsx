// // src/Component/CartItems.jsx
// import React, { useContext } from "react";
// import { Minus, Plus, Trash } from "lucide-react";
// import { ContextApi } from "../Context/AppContext";

// const CartItems = ({
//   itemId, // can be product id (context) OR cart-line id (API)
//   name,
//   price,
//   image,
//   showControls = true,

//   // NEW (optional) when using API:
//   quantity, // override qty shown
//   onIncrement, // (id) => void
//   onDecrement, // (id) => void
//   onDelete, // (id) => void
// }) => {
//   const { addToCart, removeToCart, cartItems } = useContext(ContextApi);

//   // If quantity is passed (API mode), use it; else fallback to context
//   const itemQty =
//     typeof quantity === "number" ? quantity : cartItems[String(itemId)] || 0;

//   const handleInc = () =>
//     onIncrement ? onIncrement(itemId) : addToCart(itemId);
//   const handleDec = () =>
//     onDecrement ? onDecrement(itemId) : removeToCart(itemId);
//   const handleDelete = () => onDelete && onDelete(itemId);

//   return (
//     <div className="min-h-[150px] w-full bg-white rounded-2xl border-[1px] border-gray-300 p-4 shadow-sm">
//       <div className="flex flex-col sm:flex-row gap-4">
//         {/* Product Image */}
//         <div className="w-full sm:w-1/4 bg-[#f3f3f3] flex justify-center items-center rounded-2xl overflow-hidden">
//           <img src={image} alt={name} className="h-[120px] object-contain" />
//         </div>

//         {/* Product Details */}
//         <div className="flex-1 flex flex-col justify-between">
//           <div className="space-y-2">
//             <h2 className="text-lg sm:text-[15px]">{name}</h2>
//           </div>

//           {/* Controls */}
//           {showControls && (
//             <div className="flex items-center justify-between mt-4">
//               <div className="flex flex-col">
//                 <p className="text-[16px] font-medium text-[#273e8e]">
//                   N{price}
//                 </p>

//                 <div>
//                   {/* Delete Button */}
//                   <button
//                     onClick={handleDelete}
//                     className="h-10 w-10 flex items-center justify-center rounded-lg shadow bg-white hover:bg-gray-100"
//                     aria-label="Remove item"
//                   >
//                     <Trash color="red" size={18} />
//                   </button>
//                 </div>
//               </div>
//               {/* Quantity Controls */}
//               <div className="flex items-center gap-3">
//                 <button
//                   onClick={handleDec}
//                   className="h-7 w-7 flex items-center justify-center bg-[#273e8e] rounded-md text-white hover:bg-[#1f2f6e] transition"
//                   aria-label="Decrease"
//                 >
//                   <Minus size={16} />
//                 </button>

//                 <span className="text-lg font-medium">{itemQty}</span>

//                 <button
//                   onClick={handleInc}
//                   className="h-7 w-7 flex items-center justify-center bg-[#273e8e] rounded-md text-white hover:bg-[#1f2f6e] transition"
//                   aria-label="Increase"
//                 >
//                   <Plus size={16} />
//                 </button>
//               </div>
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default CartItems;
import React, { useContext } from "react";
import { Minus, Plus, Trash } from "lucide-react";
import { Link } from "react-router-dom";
import { ContextApi } from "../Context/AppContext";

const FALLBACK_IMAGE =
  "https://api.troosolar.com/storage/products/d5c7f116-57ed-46ef-a659-337c94c308a9.png";

const CartItems = ({
  itemId,
  productId,
  name,
  price,
  image,
  showControls = true,
  quantity,
  onIncrement,
  onDecrement,
  onDelete,
  linkPath, // NEW: custom link path
}) => {
  const { addToCart, removeToCart, cartItems } = useContext(ContextApi);

  const itemQty =
    typeof quantity === "number" ? quantity : cartItems[String(itemId)] || 0;

  const handleInc = () => (onIncrement ? onIncrement(itemId) : addToCart(itemId));
  const handleDec = () => (onDecrement ? onDecrement(itemId) : removeToCart(itemId));
  const handleDelete = () => onDelete && onDelete(itemId);

  const formatted = typeof price === "number" ? price.toLocaleString() : String(price);

  const defaultPath = `/homePage/product/${productId}`;
  const finalPath = linkPath || defaultPath;
  const displayImage = image || FALLBACK_IMAGE;

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-300 p-3 ">
      {/* Row on mobile & desktop so image is LEFT on mobile too */}
      <div className="flex items-center gap-4">
        {/* Image */}
        <div className="h-20 w-20 shrink-0 rounded-xl bg-[#f3f3f3] flex items-center justify-center overflow-hidden">
          <img
            src={displayImage}
            alt={name}
            className="h-16 w-16 object-contain"
            onError={(e) => {
              if (e.target.src !== FALLBACK_IMAGE) {
                e.target.src = FALLBACK_IMAGE;
              }
            }}
          />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          {productId ? (
            <Link
              to={finalPath}
              className="text-[13px] sm:text-[15px] leading-5 line-clamp-2 hover:text-[#273e8e] hover:underline transition-colors"
            >
              {name}
            </Link>
          ) : (
            <h2 className="text-[13px] sm:text-[15px] leading-5 line-clamp-2">{name}</h2>
          )}

          {/* MOBILE: price, then trash + qty under it */}
          {showControls && (
            <div className="sm:hidden mt-1">
              <p className="text-xl font-semibold text-[#273e8e]">₦{formatted}</p>
              <div className="mt-2 flex items-center justify-between">
                <button
                  onClick={handleDelete}
                  className="h-8 px-3 inline-flex items-center justify-center rounded-md border border-[#E7EAF7] bg-white"
                  aria-label="Remove item"
                >
                  <Trash size={16} className="text-red-500" />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDec}
                    className="h-7 w-7 flex items-center justify-center rounded-md bg-[#273e8e] text-white"
                    aria-label="Decrease"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="min-w-5 text-center text-[15px] font-medium">
                    {itemQty}
                  </span>
                  <button
                    onClick={handleInc}
                    className="h-7 w-7 flex items-center justify-center rounded-md bg-[#273e8e] text-white"
                    aria-label="Increase"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* DESKTOP (unchanged): price + trash on left, stepper on right */}
          {showControls && (
            <div className="hidden sm:flex items-center justify-between mt-4">
              <div className="flex flex-col">
                <p className="text-[16px] font-medium text-[#273e8e]">₦{formatted}</p>
                <div>
                  <button
                    onClick={handleDelete}
                    className="h-10 w-10 flex items-center justify-center rounded-lg shadow bg-white hover:bg-gray-100"
                    aria-label="Remove item"
                  >
                    <Trash color="red" size={18} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleDec}
                  className="h-7 w-7 flex items-center justify-center bg-[#273e8e] rounded-md text-white hover:bg-[#1f2f6e] transition"
                  aria-label="Decrease"
                >
                  <Minus size={16} />
                </button>

                <span className="text-lg font-medium">{itemQty}</span>

                <button
                  onClick={handleInc}
                  className="h-7 w-7 flex items-center justify-center bg-[#273e8e] rounded-md text-white hover:bg-[#1f2f6e] transition"
                  aria-label="Increase"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )}

          {/* If controls hidden (e.g., in review modal), show just price */}
          {!showControls && (
            <p className="mt-1 text-[15px] font-medium text-[#273e8e]">₦{formatted}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CartItems;
