import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

type ChatMessage = {
  id: string;
  nickname: string;
  text: string;
  at: string;
};

const NICKNAME_KEY = "housing-toronto-nickname";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function CommunityChat() {
  const [nicknameInput, setNicknameInput] = useState(() => {
    try {
      return localStorage.getItem(NICKNAME_KEY) || "";
    } catch {
      return "";
    }
  });
  const [nickname, setNickname] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [online, setOnline] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const socket = io({
      path: "/socket.io",
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => {
      setConnected(false);
      setOnline(0);
    });
    socket.on("history", (history: ChatMessage[]) => {
      setMessages(Array.isArray(history) ? history : []);
    });
    socket.on("message", (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    });
    socket.on("presence", (payload: { online?: number }) => {
      setOnline(typeof payload.online === "number" ? payload.online : 0);
    });
    socket.on("chat:error", (payload: { error?: string }) => {
      setError(payload.error || "Something went wrong.");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, nickname]);

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    const next = nicknameInput.trim();
    if (next.length < 2 || next.length > 20) {
      setError("Nickname must be 2–20 characters.");
      return;
    }

    setError(null);
    try {
      localStorage.setItem(NICKNAME_KEY, next);
    } catch {
      /* ignore */
    }
    setNickname(next);
    socketRef.current?.emit("join", { nickname: next });
  }

  function handleSend(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !nickname) return;
    socketRef.current?.emit("message", { text });
    setDraft("");
  }

  return (
    <section className="chat-section" aria-labelledby="chat-heading">
      <div className="section-header chat-header">
        <div>
          <h2 id="chat-heading">Community chat</h2>
          <p>Talk with others looking for shelter in Toronto.</p>
        </div>
        {nickname ? (
          <p className="chat-presence" aria-live="polite">
            {connected ? `${online} online` : "Reconnecting…"}
          </p>
        ) : null}
      </div>

      {!nickname ? (
        <form className="chat-gate" onSubmit={handleJoin}>
          <label htmlFor="chat-nickname">Choose a nickname</label>
          <div className="search-row">
            <input
              id="chat-nickname"
              type="text"
              maxLength={20}
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder="e.g. Alex"
              required
            />
            <button type="submit">Join chat</button>
          </div>
          {error ? <p className="message message-error">{error}</p> : null}
        </form>
      ) : (
        <div className="chat-panel">
          <div className="chat-thread" ref={listRef} role="log" aria-live="polite">
            {messages.length === 0 ? (
              <p className="chat-empty">No messages yet. Say hello.</p>
            ) : (
              messages.map((message) => {
                const isOwn = message.nickname === nickname;
                return (
                  <article
                    key={message.id}
                    className={`chat-message${isOwn ? " chat-message-own" : ""}`}
                  >
                    <header className="chat-message-meta">
                      <span className="chat-message-name">{message.nickname}</span>
                      <span className="chat-message-time">
                        {formatTime(message.at)}
                      </span>
                    </header>
                    <p className="chat-message-text">{message.text}</p>
                  </article>
                );
              })
            )}
          </div>

          <form className="chat-composer" onSubmit={handleSend}>
            <label className="visually-hidden" htmlFor="chat-draft">
              Message
            </label>
            <input
              id="chat-draft"
              type="text"
              maxLength={280}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message as ${nickname}`}
              disabled={!connected}
            />
            <button type="submit" disabled={!connected || !draft.trim()}>
              Send
            </button>
          </form>
          {error ? <p className="message message-error">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
