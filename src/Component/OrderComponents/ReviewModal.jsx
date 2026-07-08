import React, { useState } from "react";
import { X, Star } from "lucide-react";

const ReviewModal = ({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
  error = null,
  existingReview = null,
  productTitle = null,
}) => {
  const [rating, setRating] = useState(existingReview?.rating || 4);
  const [reviewText, setReviewText] = useState(existingReview?.reviewText || "");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSubmit && !loading) {
      onSubmit({ rating, reviewText });
    }
  };

  const handleClose = () => {
    if (!loading) {
      setReviewText(existingReview?.reviewText || "");
      setRating(existingReview?.rating || 4);
      onClose();
    }
  };

  // Update state when existingReview changes
  React.useEffect(() => {
    if (existingReview) {
      setRating(existingReview.rating);
      setReviewText(existingReview.reviewText);
    } else {
      setRating(4);
      setReviewText("");
    }
  }, [existingReview]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40  bg-opacity-50">
      {/* Web Version - Centered Modal */}
      <div className="hidden sm:block">
        <div className="bg-white rounded-2xl shadow-lg w-[400px] max-w-[90vw] relative">
          {/* Header */}
          <div className="relative border-b border-gray-200 px-6 py-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="absolute right-4 top-3 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              <X size={24} />
            </button>
            <div className="pr-10 text-center">
              <h2 className="text-md text-gray-900">Add a review</h2>
              {productTitle ? (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{productTitle}</p>
              ) : null}
            </div>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-6">
            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Star Rating */}
            <div className="flex items-center justify-center gap-2 mb-6 border-1 border-gray-300 rounded-xl px-2 py-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => !loading && setRating(star)}
                  disabled={loading}
                  className="focus:outline-none disabled:opacity-50"
                >
                  <Star
                    size={24}
                    className={`${
                      star <= rating
                        ? "text-[#F8A91D] fill-current"
                        : "text-gray-300"
                    } transition-colors`}
                  />
                </button>
              ))}
            </div>

            {/* Review text — optional; stars alone are enough */}
            <div className="mb-6">
              <label className="block text-xs font-medium text-gray-600 mb-2">
                Comment <span className="text-gray-400 font-normal"></span>
              </label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Add a few words"
                disabled={loading}
                rows={4}
                className="w-full min-h-[100px] px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#273e8e] focus:border-transparent resize-y text-gray-700 placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Save Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#273e8e] text-white font-semibold py-3 rounded-xl hover:bg-[#1e327a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </form>
        </div>
      </div>

      {/* Mobile Version - Bottom Sheet */}
      <div className="sm:hidden block w-full">
        <div className="bg-white rounded-t-3xl shadow-lg w-full max-h-[80vh] relative animate-slide-up">
          {/* Header */}
          <div className="relative px-6 pt-6 pb-2 border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              <X size={24} />
            </button>
            <div className="pr-10 text-center">
              <h2 className="text-lg font-semibold text-gray-900">Add a review</h2>
              {productTitle ? (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{productTitle}</p>
              ) : null}
            </div>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-6">
            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Star Rating */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => !loading && setRating(star)}
                  disabled={loading}
                  className="focus:outline-none disabled:opacity-50"
                >
                  <Star
                    size={28}
                    className={`${
                      star <= rating
                        ? "text-[#F8A91D] fill-current"
                        : "text-gray-300"
                    } transition-colors`}
                  />
                </button>
              ))}
            </div>

            {/* Review text — optional */}
            <div className="mb-6">
              <label className="block text-xs font-medium text-gray-600 mb-2">
                Comment <span className="text-gray-400 font-normal"></span>
              </label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Add a few words "
                disabled={loading}
                rows={4}
                className="w-full min-h-[100px] px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#273e8e] focus:border-transparent resize-y text-gray-700 placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Save Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#273e8e] text-white font-semibold py-4 rounded-xl hover:bg-[#1e327a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ReviewModal;
