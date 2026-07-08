import React, { useEffect, useState } from "react";
import axios from "axios";
import API from "../config/api.config";
import { ChevronDown, HelpCircle } from "lucide-react";

/**
 * FAQs loaded from backend so they can be edited without code changes.
 * API: GET /api/site/faqs should return { data: [ { question, answer } ] } or { data: [ { title, content } ] }
 */
const FAQ = () => {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const res = await axios.get(API.SITE_FAQS, {
          headers: { Accept: "application/json" },
        });
        const raw = res?.data?.data ?? res?.data ?? [];
        const list = Array.isArray(raw) ? raw : [];
        setFaqs(
          list.map((item, idx) => ({
            id: item.id ?? idx,
            question: item.question ?? item.title ?? "",
            answer: item.answer ?? item.content ?? "",
          }))
        );
      } catch {
        setFaqs([]);
      } finally {
        setLoading(false);
      }
    };
    fetchFaqs();
  }, []);

  if (loading) {
    return (
      <div className="py-6 text-center text-gray-500">Loading FAQs…</div>
    );
  }

  if (faqs.length === 0) {
    return (
      <div className="py-6 text-center text-gray-500">
        No FAQs available yet. Ask your admin to add them under{" "}
        <strong>Settings → FAQs</strong> in the admin panel.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 font-semibold text-gray-800 mb-4">
        <HelpCircle size={20} className="text-[#273e8e]" />
        Frequently Asked Questions
      </h3>
      {faqs.map((faq) => (
        <div
          key={faq.id}
          className="border border-gray-200 rounded-lg overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
            className="w-full flex items-center justify-between p-4 text-left bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="font-medium text-gray-800 pr-2">{faq.question}</span>
            <ChevronDown
              size={20}
              className={`flex-shrink-0 text-gray-500 transition-transform ${
                openId === faq.id ? "rotate-180" : ""
              }`}
            />
          </button>
          {openId === faq.id && (
            <div className="p-4 pt-0 text-gray-600 text-sm border-t border-gray-100 whitespace-pre-line">
              {faq.answer}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default FAQ;
