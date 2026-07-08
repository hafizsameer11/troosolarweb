import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Send } from "lucide-react";
import axios from "axios";
import API from "../../config/api.config";

const POLL_INTERVAL_DESKTOP_MS = 5000;
const POLL_INTERVAL_MOBILE_MS = 10000;

const getPollInterval = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(max-width: 639px)").matches
    ? POLL_INTERVAL_MOBILE_MS
    : POLL_INTERVAL_DESKTOP_MS;

const messageSignature = (list) =>
  Array.isArray(list)
    ? list
        .map((m) => `${m.sender}|${m.message}|${m.created_at || m.date || ""}`)
        .join(";;")
    : "";

const formatWhen = (s) => {
  const d = new Date((s || "").replace(" ", "T"));
  if (isNaN(d.getTime())) return s || "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const time = d.toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${dd}-${mm}-${yyyy} / ${time}`;
};

const normalizeMessages = (list) =>
  Array.isArray(list)
    ? list.map((m) => ({
        sender: m.sender,
        message: m.message,
        created_at: m.created_at || m.date,
      }))
    : [];

const MessageSection = ({
  ticket,
  messages: initialMessages = [],
  onBack,
  onTicketUpdated,
}) => {
  const ticketId = ticket?.id ?? ticket?.ticket_id;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  const [messages, setMessages] = useState(() =>
    normalizeMessages(initialMessages)
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [status, setStatus] = useState(ticket?.status || "pending");
  const pollTimerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const prevMessageCountRef = useRef(messages.length);
  const lastAppliedSigRef = useRef(messageSignature(messages));
  const lastStatusRef = useRef(status);

  const isClosed = String(status || "").toLowerCase() === "closed";

  const ticketInfo = useMemo(
    () => [
      { label: "Ticket ID", value: ticketId ?? "—" },
      { label: "Subject", value: ticket?.subject ?? "—" },
      {
        label: "Opened",
        value: formatWhen(ticket?.created_at || ticket?.date),
      },
      {
        label: "Status",
        value: String(status || "pending").replace(/^\w/, (c) =>
          c.toUpperCase()
        ),
      },
    ],
    [ticket, ticketId, status]
  );

  const applyTicketPayload = useCallback(
    (payload) => {
      if (!payload) return;
      const nextMessages = normalizeMessages(payload.messages);
      const nextSig = messageSignature(nextMessages);
      const messagesChanged = nextSig !== lastAppliedSigRef.current;
      const statusChanged =
        payload.status &&
        String(payload.status).toLowerCase() !==
          String(lastStatusRef.current).toLowerCase();

      if (messagesChanged) {
        lastAppliedSigRef.current = nextSig;
        setMessages(nextMessages);
      }
      if (statusChanged) {
        lastStatusRef.current = payload.status;
        setStatus(payload.status);
      }

      if (
        typeof onTicketUpdated === "function" &&
        ticketId &&
        (messagesChanged || statusChanged)
      ) {
        onTicketUpdated(ticketId, {
          messages: nextMessages,
          status: payload.status,
          subject: payload.subject ?? ticket?.subject,
          created_at: payload.created_at ?? ticket?.created_at,
        });
      }
    },
    [onTicketUpdated, ticket?.created_at, ticket?.subject, ticketId]
  );

  const fetchTicket = useCallback(async () => {
    if (!ticketId || !token) return null;
    const { data } = await axios.get(API.TICKET_DETAIL(ticketId), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = data?.data ?? data;
    applyTicketPayload(payload);
    return payload;
  }, [applyTicketPayload, ticketId, token]);

  useEffect(() => {
    const initial = normalizeMessages(initialMessages);
    lastAppliedSigRef.current = messageSignature(initial);
    lastStatusRef.current = ticket?.status || "pending";
    setMessages(initial);
    setStatus(ticket?.status || "pending");
  }, [ticketId, initialMessages, ticket?.status]);

  useEffect(() => {
    if (!ticketId || !token) return undefined;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) {
        pollTimerRef.current = window.setTimeout(poll, getPollInterval());
        return;
      }
      try {
        await fetchTicket();
      } catch {
        // Keep polling; transient network errors should not stop updates.
      }
      if (!cancelled) {
        pollTimerRef.current = window.setTimeout(poll, getPollInterval());
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
      }
    };
  }, [fetchTicket, ticketId, token]);

  useEffect(() => {
    const grew = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;
    if (!grew) return;

    const isMobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 639px)").matches;
    messagesEndRef.current?.scrollIntoView({
      behavior: isMobile ? "auto" : "smooth",
      block: "end",
    });
  }, [messages]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || sending || isClosed) return;
    if (!token) {
      setSendError("Please log in to send messages.");
      return;
    }
    if (!ticketId) {
      setSendError("Ticket not found.");
      return;
    }

    setSending(true);
    setSendError("");
    try {
      const { data } = await axios.post(
        API.TICKET_REPLY(ticketId),
        { message: text },
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const payload = data?.data ?? data;
      applyTicketPayload(payload);
      setDraft("");
    } catch (e) {
      setSendError(
        e?.response?.data?.message || e?.message || "Failed to send message."
      );
    } finally {
      setSending(false);
    }
  };

  const handleEnterSend = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderMessages = () =>
    messages.length > 0 ? (
      messages.map((m, i) => {
        const isUser = String(m.sender || "").toLowerCase() !== "admin";
        return (
          <div
            key={`${m.created_at}-${i}`}
            className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
          >
            <div
              className={`${
                isUser
                  ? "bg-[#273e8e] text-white"
                  : "bg-gray-200 text-gray-700"
              } rounded-2xl px-4 py-3 shadow max-w-[85%] whitespace-pre-wrap break-words`}
            >
              {m.message}
            </div>
            <span
              className={`text-xs text-gray-500 mt-1 ${isUser ? "" : "ml-1"}`}
            >
              {formatWhen(m.created_at)}
            </span>
          </div>
        );
      })
    ) : (
      <div className="flex flex-col items-start">
        <div className="bg-gray-200 text-gray-700 rounded-2xl px-4 py-3">
          No messages yet.
        </div>
      </div>
    );

  const renderComposer = (isMobile) => {
    if (isClosed) {
      return (
        <p className="text-sm text-gray-500 text-center py-2">
          This ticket is closed. Open a new ticket if you need more help.
        </p>
      );
    }

    return (
      <>
        {sendError ? (
          <p className="text-sm text-red-600 mb-2">{sendError}</p>
        ) : null}
        {isMobile ? (
          <div className="flex items-center bg-white rounded-2xl px-3 py-2 touch-manipulation">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleEnterSend}
              placeholder="Type a message..."
              className="flex-1 bg-transparent outline-none text-sm px-2 min-h-[44px]"
              disabled={sending}
              enterKeyHint="send"
              autoComplete="off"
            />
            <button
              type="button"
              className="p-2 disabled:opacity-50"
              onClick={sendMessage}
              disabled={sending || !draft.trim()}
              aria-label="Send message"
            >
              <Send className="text-[#273e8e]" size={20} />
            </button>
          </div>
        ) : (
          <div className="relative">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleEnterSend}
              className="w-full border rounded-2xl px-4 py-3 resize-none h-[72px] pr-14"
              placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
              disabled={sending}
            />
            <button
              type="button"
              className="absolute top-8 -translate-y-1/2 right-4 disabled:opacity-50"
              onClick={sendMessage}
              disabled={sending || !draft.trim()}
              aria-label="Send message"
            >
              <Send className="text-[#273e8e] w-6 h-6" />
            </button>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      {/* Desktop View */}
      <div className="hidden sm:flex min-h-[70vh] p-4 flex-col justify-between bg-white">
        <div>
          <div className="relative flex items-center justify-center mb-6">
            <ChevronLeft
              className="absolute left-0 cursor-pointer"
              onClick={onBack}
            />
            <h2 className="text-lg font-semibold text-gray-800">
              Support ticket
            </h2>
          </div>

          <div className="bg-white border rounded-2xl p-4 shadow mb-6">
            {ticketInfo.map((item, index) => (
              <div key={item.label}>
                <div className="flex justify-between items-center py-2 gap-4">
                  <span className="text-gray-400 shrink-0">{item.label}</span>
                  <span className="text-gray-700 text-right break-words">
                    {item.value}
                  </span>
                </div>
                {index < ticketInfo.length - 1 && (
                  <hr className="border-gray-200" />
                )}
              </div>
            ))}
          </div>

          <div className="space-y-4 mb-6 max-h-[45vh] overflow-y-auto pr-1">
            {renderMessages()}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div>{renderComposer(false)}</div>
      </div>

      {/* Mobile View */}
      <div className="sm:hidden flex min-h-[100dvh] bg-[#f5f6ff] flex-col">
        <div className="flex items-center justify-center relative py-3 px-4 bg-[#f5f6ff] shrink-0">
          <ChevronLeft
            className="absolute left-4 cursor-pointer touch-manipulation"
            onClick={onBack}
          />
          <h2 className="text-sm font-semibold text-gray-800">Support ticket</h2>
        </div>

        <div className="flex-1 min-h-0 py-3 pb-28 overflow-y-auto overscroll-y-contain touch-pan-y px-4">
          <div className="bg-white rounded-xl p-4 mb-4 border border-gray-300">
            {ticketInfo.map((item, index) => (
              <div key={item.label}>
                <div className="flex justify-between items-center py-2 gap-3">
                  <span className="text-xs text-gray-500 shrink-0">
                    {item.label}
                  </span>
                  <span className="text-xs font-medium text-gray-700 text-right break-words">
                    {item.value}
                  </span>
                </div>
                {index < ticketInfo.length - 1 && (
                  <hr className="border-gray-200" />
                )}
              </div>
            ))}
          </div>

          <div className="space-y-4">
            {renderMessages()}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-[#f5f6ff] border-t border-gray-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {renderComposer(true)}
        </div>
      </div>
    </>
  );
};

export default MessageSection;
