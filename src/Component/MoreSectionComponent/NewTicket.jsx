import React, { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import MessageSection from "./MessageSection";
import axios from "axios";
import API, { BASE_URL } from "../../config/api.config";

const TICKETS_URL = API.TICKETS || `${BASE_URL}/website/tickets`;
const SUBJECTS_URL = API.TICKET_SUBJECTS || `${BASE_URL}/site/ticket-subjects`;

const SubjectSelect = ({ value, onChange, subjects, loading, id }) => (
  <div>
    <label
      htmlFor={id}
      className="block text-sm font-medium text-gray-700 mb-2"
    >
      Subject
    </label>
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={loading || subjects.length === 0}
      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-[#273e8e] focus:border-[#273e8e] disabled:bg-gray-100 disabled:text-gray-500"
    >
      <option value="">
        {loading
          ? "Loading subjects..."
          : subjects.length === 0
            ? "No subjects available — contact support"
            : "Select ticket subject"}
      </option>
      {subjects.map((s) => (
        <option key={s.id} value={s.title}>
          {s.title}
        </option>
      ))}
    </select>
  </div>
);

const NewTicket = ({ onCancel, onCreated }) => {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);

  const [created, setCreated] = useState(null);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  useEffect(() => {
    const loadSubjects = async () => {
      try {
        setSubjectsLoading(true);
        const { data } = await axios.get(SUBJECTS_URL, {
          headers: { Accept: "application/json" },
        });
        const raw = data?.data ?? data ?? [];
        const list = Array.isArray(raw) ? raw : [];
        setSubjects(
          list
            .filter((s) => s?.title)
            .sort(
              (a, b) =>
                (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
            )
        );
      } catch {
        setSubjects([]);
      } finally {
        setSubjectsLoading(false);
      }
    };
    loadSubjects();
  }, []);

  const handleSubmit = async () => {
    setError("");
    if (!subject.trim() || !body.trim()) {
      setError("Please select a subject and enter a message.");
      return;
    }
    if (!token) {
      setError("Please log in to create a ticket.");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await axios.post(
        TICKETS_URL,
        { subject: subject.trim(), message: body.trim() },
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const payload = data?.data || data || {};
      const id = payload?.ticket_id ?? payload?.id;
      const messages = Array.isArray(payload?.messages) ? payload.messages : [];
      const subjectResp = payload?.subject ?? subject.trim();
      const date = payload?.date ?? new Date().toISOString();

      const normalized = {
        id,
        subject: subjectResp,
        date,
        created_at: date,
        status: "Pending",
        messages,
      };
      setCreated(normalized);

      if (typeof onCreated === "function") {
        onCreated({ ticket_id: id, subject: subjectResp, date, messages });
      }
    } catch (e) {
      setError(
        e?.response?.data?.message || e?.message || "Failed to create ticket."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <MessageSection
        ticket={created}
        messages={created.messages}
        onBack={() => {
          setCreated(null);
          if (typeof onCancel === "function") onCancel();
        }}
      />
    );
  }

  return (
    <>
      {/* Desktop View */}
      <div className="hidden sm:flex min-h-screen flex-col justify-between">
        <div>
          <div className="relative flex items-center justify-center mb-6">
            <ChevronLeft
              className="absolute left-0 cursor-pointer"
              onClick={onCancel}
            />
            <p className="text-lg font-semibold text-gray-800">New Ticket</p>
          </div>

          <div className="mb-6">
            <SubjectSelect
              id="subject-desktop"
              value={subject}
              onChange={setSubject}
              subjects={subjects}
              loading={subjectsLoading}
            />
          </div>

          <div>
            <label
              htmlFor="message"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Message
            </label>
            <textarea
              id="message"
              rows="6"
              className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {error ? (
              <p className="text-xs text-red-600 mt-2">{error}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-10">
          <button
            onClick={handleSubmit}
            className="w-full flex items-center justify-center bg-[#273e8e] text-white font-medium text-sm rounded-full py-4 px-6 shadow hover:bg-[#1e2f75] transition disabled:opacity-60"
            disabled={submitting || subjectsLoading || subjects.length === 0}
          >
            {submitting ? "Sending..." : "Send"}
          </button>
        </div>
      </div>

      {/* Mobile View */}
      <div className="sm:hidden block min-h-screen bg-[#f5f6ff]">
        <div className="flex-1 flex flex-col">
          <div className="mb-6 mt-4">
            <SubjectSelect
              id="subject-mobile"
              value={subject}
              onChange={setSubject}
              subjects={subjects}
              loading={subjectsLoading}
            />
          </div>

          <div className="flex-1 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-3 text-sm outline-none resize-none h-64"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {error ? (
              <p className="text-xs text-red-600 mt-2">{error}</p>
            ) : null}
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#f5f6ff] border-t border-gray-200">
          <button
            onClick={handleSubmit}
            className="w-full bg-[#273e8e] text-white rounded-full py-3 text-sm font-medium disabled:opacity-60"
            disabled={submitting || subjectsLoading || subjects.length === 0}
          >
            {submitting ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </>
  );
};

export default NewTicket;
