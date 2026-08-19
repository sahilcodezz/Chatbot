import { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";

const STORAGE_KEY = "ai-chat-history";
const MEMORY_KEY = "ai-chat-memories";

const suggestions = [
  { icon: "⚛", title: "Learn React", text: "Explain React hooks simply" },
  { icon: "</>", title: "Write code", text: "Create a JavaScript function" },
  { icon: "✦", title: "Prepare interview", text: "Give me a frontend interview" },
  { icon: "◈", title: "Brainstorm", text: "Give me project ideas" },
];

// ── Framer-style fade-up used for messages ──────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] } },
  exit:   { opacity: 0, y: -6, transition: { duration: 0.18 } },
};

const fadeIn = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { duration: 0.22 } },
};

const slideLeft = {
  hidden: { opacity: 0, x: 20 },
  show:   { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } },
  exit:   { opacity: 0, x: 20, transition: { duration: 0.2 } },
};

// ── Tiny reusable icon-button ────────────────────────────────────────────────
function IconBtn({ onClick, title, disabled, className = "", children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium
        text-slate-400 transition-all duration-150
        hover:bg-slate-100 hover:text-slate-600
        disabled:pointer-events-none disabled:opacity-30
        ${className}`}
    >
      {children}
    </button>
  );
}

// ── Code block ───────────────────────────────────────────────────────────────
function CodeBlock({ className, children, codeId, copiedId, onCopy }) {
  const code = String(children).replace(/\n$/, "");
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
          {(className || "").replace("language-", "") || "code"}
        </span>
        <button
          onClick={() => onCopy(code, codeId)}
          className="rounded-md px-2.5 py-1 text-[10px] font-medium text-slate-400
            transition hover:bg-slate-700 hover:text-white"
        >
          {copiedId === codeId ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-6 text-slate-100">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

// ── Markdown renderer ────────────────────────────────────────────────────────
function AIMarkdown({ content, messageId, copiedId, onCopy }) {
  return (
    <div className="prose-ai text-sm leading-7">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }) {
            if (inline) {
              return <code {...props}>{children}</code>;
            }
            return (
              <CodeBlock
                className={className}
                codeId={`code-${messageId}-${Math.random().toString(36).slice(2, 6)}`}
                copiedId={copiedId}
                onCopy={onCopy}
              >
                {children}
              </CodeBlock>
            );
          },
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul>{children}</ul>,
          ol: ({ children }) => <ol>{children}</ol>,
          strong: ({ children }) => <strong>{children}</strong>,
          h1: ({ children }) => <h1>{children}</h1>,
          h2: ({ children }) => <h2>{children}</h2>,
          h3: ({ children }) => <h3>{children}</h3>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── State ────────────────────────────────────────────────────────────────
  const [chats, setChats] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  });
  const [memories, setMemories] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MEMORY_KEY)) || []; }
    catch { return []; }
  });
  const [activeChat, setActiveChat]   = useState(null);
  const [input, setInput]             = useState("");
  const [isLoading, setIsLoading]     = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedId, setCopiedId]       = useState(null);
  const [feedback, setFeedback]       = useState(() => {
    try { return JSON.parse(localStorage.getItem("ai-chat-feedback")) || {}; }
    catch { return {}; }
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId]     = useState(null);
  const [editText, setEditText]       = useState("");
  const [memoryOpen, setMemoryOpen]   = useState(false);

  const messagesEndRef    = useRef(null);
  const abortControllerRef = useRef(null);
  const textareaRef        = useRef(null);

  // ── Persistence ──────────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(chats)); }, [chats]);
  useEffect(() => { localStorage.setItem(MEMORY_KEY, JSON.stringify(memories)); }, [memories]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const currentChat   = chats.find((c) => c.id === activeChat);
  const messages      = currentChat?.messages || [];
  const filteredChats = chats.filter((chat) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      chat.title?.toLowerCase().includes(q) ||
      chat.preview?.toLowerCase().includes(q) ||
      chat.messages?.some((m) => m.content?.toLowerCase().includes(q))
    );
  });

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ── Auto-resize textarea ─────────────────────────────────────────────────
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  // ── Memory helpers ────────────────────────────────────────────────────────
  const deleteMemory = (index) =>
    setMemories((prev) => prev.filter((_, i) => i !== index));

  const clearMemories = () => {
    if (window.confirm("Delete all saved memories?")) setMemories([]);
  };

  const consolidateMemories = async () => {
    if (memories.length < 2) return;
    try {
      const res  = await fetch("http://localhost:5000/api/memory/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memories }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      setMemories(data.memories);
    } catch (e) {
      console.error("Memory consolidation error:", e);
    }
  };

  const addMemory = () => {
    const memory = window.prompt("Enter a memory to save:");
    if (!memory?.trim()) return;
    const nm = memory.trim();
    setMemories((prev) => {
      if (prev.some((m) => m.toLowerCase() === nm.toLowerCase())) return prev;
      return [...prev, nm];
    });
  };

  const extraMemory = async (userText) => {
    try {
      const res  = await fetch("http://localhost:5000/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: userText }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) return;
      if (data.shouldRemember && data.memory) {
        setMemories((prev) => {
          const nm = data.memory.trim();
          if (prev.some((m) => m.trim().toLowerCase() === nm.toLowerCase())) return prev;
          return [...prev, nm];
        });
      }
    } catch (e) {
      console.error("Memory extraction error:", e);
    }
  };

  // ── Stop generating ──────────────────────────────────────────────────────
  const stopGenerating = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
  };

  // ── Edit message ─────────────────────────────────────────────────────────
  const startEdit  = (msg) => { setEditingId(msg.id); setEditText(msg.content); };
  const cancelEdit = () => { setEditingId(null); setEditText(""); };

  const submitEdit = async (messageId) => {
    if (!editText.trim() || isLoading) return;
    const chat = chats.find((c) => c.id === activeChat);
    if (!chat) return;
    const idx = chat.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const newText = editText.trim();
    setEditingId(null); setEditText(""); setIsLoading(true);
    const updated = chat.messages.slice(0, idx + 1).map((m) =>
      m.id === messageId ? { ...m, content: newText } : m
    );
    const history = updated.slice(0, idx);
    setChats((prev) => prev.map((c) => c.id === activeChat ? { ...c, messages: updated } : c));
    try {
      abortControllerRef.current = new AbortController();
      const res  = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: newText, history }),
        signal: abortControllerRef.current.signal,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      setChats((prev) => prev.map((c) =>
        c.id === activeChat
          ? { ...c, messages: [...updated, { id: Date.now(), role: "assistant", content: data.reply }] }
          : c
      ));
    } catch (e) {
      if (e.name === "AbortError") return;
      setChats((prev) => prev.map((c) =>
        c.id === activeChat
          ? { ...c, messages: [...updated, { id: Date.now(), role: "assistant", content: "Unable to connect to the backend." }] }
          : c
      ));
    } finally { setIsLoading(false); }
  };

  // ── New chat ─────────────────────────────────────────────────────────────
  const createNewChat = () => { setActiveChat(null); setInput(""); setSidebarOpen(false); };

  // ── Regenerate ───────────────────────────────────────────────────────────
  const regenerateResponse = async (assistantMsgId) => {
    if (isLoading || !activeChat) return;
    const chat = chats.find((c) => c.id === activeChat);
    if (!chat) return;
    const idx = chat.messages.findIndex((m) => m.id === assistantMsgId);
    if (idx === -1 || chat.messages[idx].role !== "assistant") return;
    const userMsg = [...chat.messages].slice(0, idx).reverse().find((m) => m.role === "user");
    if (!userMsg) return;
    const userIdx = chat.messages.findIndex((m) => m.id === userMsg.id);
    const history = chat.messages.slice(0, userIdx);
    setIsLoading(true);
    try {
      abortControllerRef.current = new AbortController();
      const res  = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.content, history }),
        signal: abortControllerRef.current.signal,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      setChats((prev) => prev.map((c) =>
        c.id === activeChat
          ? { ...c, messages: c.messages.map((m) => m.id === assistantMsgId ? { ...m, content: data.reply } : m) }
          : c
      ));
    } catch (e) {
      if (e.name === "AbortError") return;
    } finally { setIsLoading(false); }
  };

  // ── Feedback ─────────────────────────────────────────────────────────────
  const handleFeedback = (messageId, type) => {
    setFeedback((prev) => {
      const updated = { ...prev, [messageId]: prev[messageId] === type ? null : type };
      localStorage.setItem("ai-chat-feedback", JSON.stringify(updated));
      return updated;
    });
  };

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userText = input.trim();
    setInput(""); setIsLoading(true);
    extraMemory(userText);
    const chatId = activeChat || Date.now();
    const userMsg = { id: Date.now(), role: "user", content: userText };
    const prevMsgs = chats.find((c) => c.id === chatId)?.messages || [];
    const chatHistory = [...prevMsgs, userMsg];
    if (!activeChat) {
      setChats((prev) => [
        {
          id: chatId,
          title: userText.length > 32 ? userText.slice(0, 32) + "…" : userText,
          preview: userText,
          time: "Now",
          messages: [userMsg],
        },
        ...prev,
      ]);
      setActiveChat(chatId);
    } else {
      setChats((prev) => prev.map((c) =>
        c.id === chatId
          ? { ...c, preview: userText, time: "Now", messages: [...(c.messages || []), userMsg] }
          : c
      ));
    }
    try {
      abortControllerRef.current = new AbortController();
      const res  = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, history: chatHistory, memories }),
        signal: abortControllerRef.current.signal,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error);
      setChats((prev) => prev.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...(c.messages || []), { id: Date.now() + 1, role: "assistant", content: data.reply }] }
          : c
      ));
    } catch (e) {
      if (e.name === "AbortError") return;
      setChats((prev) => prev.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...(c.messages || []), { id: Date.now() + 1, role: "assistant", content: "Unable to connect to the backend. Please make sure the server is running." }] }
          : c
      ));
    } finally { setIsLoading(false); }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Chat list helpers ────────────────────────────────────────────────────
  const openChat   = (id) => { setActiveChat(id); setSidebarOpen(false); };
  const deleteChat = (id, e) => {
    e.stopPropagation();
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (activeChat === id) setActiveChat(null);
  };

  // ── Copy ─────────────────────────────────────────────────────────────────
  const copyMessage = async (text, id) => {
    try { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 1500); }
    catch (e) { console.error(e); }
  };
  const copyCode = async (code, id) => {
    try { await navigator.clipboard.writeText(code); setCopiedId(id); setTimeout(() => setCopiedId(null), 1500); }
    catch (e) { console.error(e); }
  };

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] text-slate-900">

      {/* ── Mobile overlay ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════
          SIDEBAR
      ══════════════════════════════════════════════════════════════════ */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col
          border-r border-slate-200 bg-white
          transition-transform duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]
          lg:relative lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Logo */}
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-slate-100 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-bold text-white">
              AI
            </div>
            <span className="text-[13px] font-semibold tracking-tight text-slate-900">AI Assistant</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 lg:hidden"
          >
            ✕
          </button>
        </div>

        {/* New chat */}
        <div className="p-3">
          <button
            onClick={createNewChat}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg
              border border-slate-200 bg-white text-[12px] font-medium text-slate-600
              shadow-sm transition-all duration-150 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          >
            <span className="text-base leading-none">+</span>
            New conversation
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50
            px-3 py-2 focus-within:border-blue-400 transition-colors duration-150">
            <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-600 outline-none placeholder:text-slate-400"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-[11px] text-slate-400 hover:text-slate-600">✕</button>
            )}
          </div>
        </div>

        {/* Chat list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          <p className="mb-1.5 px-2 pt-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-400">
            Conversations
          </p>

          {filteredChats.length === 0 ? (
            <div className="px-2 py-6 text-center">
              <p className="text-[11px] text-slate-400">
                {searchQuery ? "No results" : "No conversations yet"}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5 pb-2">
              {filteredChats.map((chat) => (
                <motion.div
                  key={chat.id}
                  layout
                  onClick={() => openChat(chat.id)}
                  className={`group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2.5 transition-colors duration-100
                    ${activeChat === chat.id
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    }`}
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span className="flex-1 truncate text-[11px] font-medium">{chat.title}</span>
                  <button
                    onClick={(e) => deleteChat(chat.id, e)}
                    className="hidden text-slate-300 transition hover:text-red-500 group-hover:block"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Memory section */}
        <div className="shrink-0 border-t border-slate-100">
          <button
            onClick={() => setMemoryOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-slate-50"
          >
            <span className="text-sm">🧠</span>
            <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              AI Memory
            </span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-400">
              {memories.length}
            </span>
            <svg
              className={`h-3.5 w-3.5 text-slate-300 transition-transform duration-200 ${memoryOpen ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <AnimatePresence>
            {memoryOpen && (
              <motion.div
                key="memory-panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-3">
                  {memories.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-3 text-[10px] text-slate-400">
                      No memories saved yet.
                    </p>
                  ) : (
                    <div className="max-h-36 space-y-0.5 overflow-y-auto">
                      {memories.map((memory, index) => (
                        <div
                          key={`${memory}-${index}`}
                          className="group flex items-start gap-2 rounded-lg px-2 py-2 transition hover:bg-slate-50"
                        >
                          <p className="flex-1 text-[10px] leading-4 text-slate-500">{memory}</p>
                          <button
                            onClick={() => deleteMemory(index)}
                            className="mt-0.5 hidden text-slate-300 transition hover:text-red-500 group-hover:block"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 flex gap-1.5">
                    <button
                      onClick={addMemory}
                      className="flex-1 rounded-lg border border-slate-200 py-1.5 text-[10px] text-slate-500
                        transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                    >
                      + Add
                    </button>
                    {memories.length >= 2 && (
                      <button
                        onClick={consolidateMemories}
                        className="flex-1 rounded-lg border border-slate-200 py-1.5 text-[10px] text-slate-500
                          transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                      >
                        Organize
                      </button>
                    )}
                    {memories.length > 0 && (
                      <button
                        onClick={clearMemories}
                        className="flex-1 rounded-lg border border-slate-200 py-1.5 text-[10px] text-slate-500
                          transition hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User footer */}
        <div className="shrink-0 border-t border-slate-100 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-[11px] font-bold text-white">
              S
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-slate-700">Sahil</p>
              <p className="text-[9px] text-slate-400">Free plan</p>
            </div>
            <span className="text-slate-300 text-xs">•••</span>
          </div>
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════════════════
          MAIN
      ══════════════════════════════════════════════════════════════════ */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Top bar */}
        <header className="flex h-[60px] shrink-0 items-center justify-between
          border-b border-slate-200 bg-white px-4 sm:px-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200
                text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 lg:hidden"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h2 className="text-[13px] font-semibold text-slate-900 leading-tight">
                {currentChat?.title || "New conversation"}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-[9px] font-medium uppercase tracking-wider text-slate-400">Online</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-lg border border-slate-200
              bg-white px-3 py-1.5 shadow-sm sm:flex">
              <span className="text-[11px] font-medium text-slate-500">Gemini</span>
              <svg className="h-3 w-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200
              text-slate-400 transition hover:bg-slate-50 hover:text-slate-600" title="Share">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m6.632 8.342a3 3 0 10-5.368-2.684m5.368 2.684a3 3 0 100-4m0 4v-4" />
              </svg>
            </button>
          </div>
        </header>

        {/* ── Chat area ───────────────────────────────────────────────── */}
        <section className="min-h-0 flex-1 overflow-y-auto">

          {messages.length === 0 ? (
            /* ── Empty / welcome ─────────────────────────────────────── */
            <motion.div
              key="welcome"
              variants={fadeIn}
              initial="hidden"
              animate="show"
              className="flex min-h-full flex-col items-center justify-center px-5 py-12"
            >
              {/* Logo mark */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1,   opacity: 1 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl
                  bg-gradient-to-br from-blue-500 to-blue-700
                  shadow-[0_0_40px_rgba(37,99,235,0.2)]"
              >
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </motion.div>

              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600"
              >
                AI Workspace
              </motion.p>

              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.35 }}
                className="text-center text-[28px] font-semibold tracking-tight text-slate-900 sm:text-[36px]"
              >
                How can I help you?
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                className="mt-3 max-w-md text-center text-[13px] leading-6 text-slate-400"
              >
                Ask questions, write code, prep for interviews, or brainstorm your next idea.
              </motion.p>

              {/* Suggestion cards */}
              <motion.div
                initial="hidden"
                animate="show"
                variants={{
                  show: { transition: { staggerChildren: 0.07, delayChildren: 0.28 } },
                }}
                className="mt-8 grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2"
              >
                {suggestions.map((item) => (
                  <motion.button
                    key={item.title}
                    variants={fadeUp}
                    onClick={() => setInput(item.text)}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    className="group flex items-center gap-3.5 rounded-xl border border-slate-200
                      bg-white p-4 text-left shadow-sm transition-colors duration-150
                      hover:border-blue-200 hover:bg-blue-50/50"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg
                      bg-blue-50 text-sm font-semibold text-blue-500
                      transition group-hover:bg-blue-100 group-hover:text-blue-600">
                      {item.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-slate-700 group-hover:text-slate-900 transition">
                        {item.title}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-400">{item.text}</p>
                    </div>
                    <svg className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:text-blue-500"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>

          ) : (
            /* ── Message list ────────────────────────────────────────── */
            <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
              <div className="space-y-6">
                <AnimatePresence initial={false}>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      variants={fadeUp}
                      initial="hidden"
                      animate="show"
                      exit="exit"
                      layout
                      className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >

                      {/* AI avatar */}
                      {message.role === "assistant" && (
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center
                          rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-[10px] font-bold text-white">
                          AI
                        </div>
                      )}

                      <div className={`min-w-0 max-w-[82%] ${message.role === "user" ? "flex flex-col items-end" : ""}`}>
                        <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                          {message.role === "user" ? "You" : "AI Assistant"}
                        </p>

                        {/* User bubble */}
                        {message.role === "user" ? (
                          editingId === message.id ? (
                            <div className="w-full min-w-[260px]">
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(message.id); }
                                  if (e.key === "Escape") cancelEdit();
                                }}
                                rows={3}
                                autoFocus
                                className="w-full rounded-2xl rounded-br-sm border border-blue-400
                                  bg-white px-4 py-3 text-sm text-slate-800 outline-none
                                  ring-2 ring-blue-100 focus:ring-blue-200
                                  transition resize-none"
                              />
                              <div className="mt-1.5 flex justify-end gap-1.5">
                                <button
                                  onClick={cancelEdit}
                                  className="rounded-lg px-3 py-1.5 text-[11px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => submitEdit(message.id)}
                                  disabled={!editText.trim() || isLoading}
                                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white
                                    transition hover:bg-blue-500 disabled:opacity-40"
                                >
                                  Send
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="group relative">
                              <div className="whitespace-pre-wrap rounded-2xl rounded-br-sm
                                bg-blue-600 border border-blue-600
                                px-4 py-3 text-[13px] leading-6 text-white shadow-sm">
                                {message.content}
                              </div>
                              <div className="mt-1 flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <IconBtn onClick={() => copyMessage(message.content, message.id)}>
                                  {copiedId === message.id ? "✓ Copied" : "Copy"}
                                </IconBtn>
                                <IconBtn onClick={() => startEdit(message)}>✎ Edit</IconBtn>
                              </div>
                            </div>
                          )
                        ) : (
                          /* AI message */
                          <div>
                            <AIMarkdown
                              content={message.content}
                              messageId={message.id}
                              copiedId={copiedId}
                              onCopy={copyCode}
                            />
                            {/* AI actions */}
                            <div className="mt-2 flex items-center gap-0.5">
                              <IconBtn onClick={() => copyMessage(message.content, message.id)}>
                                {copiedId === message.id ? "✓ Copied" : "Copy"}
                              </IconBtn>
                              <IconBtn onClick={() => regenerateResponse(message.id)} disabled={isLoading}>
                                ↻ Retry
                              </IconBtn>
                              <button
                                onClick={() => handleFeedback(message.id, "like")}
                                className={`rounded-lg px-2 py-1.5 text-sm transition
                                  ${feedback[message.id] === "like"
                                    ? "text-emerald-600"
                                    : "text-slate-400 hover:text-slate-600"
                                  }`}
                                title="Like"
                              >
                                👍
                              </button>
                              <button
                                onClick={() => handleFeedback(message.id, "dislike")}
                                className={`rounded-lg px-2 py-1.5 text-sm transition
                                  ${feedback[message.id] === "dislike"
                                    ? "text-red-500"
                                    : "text-slate-400 hover:text-slate-600"
                                  }`}
                                title="Dislike"
                              >
                                👎
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* User avatar */}
                      {message.role === "user" && (
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center
                          rounded-full bg-slate-800 text-[10px] font-bold text-white">
                          S
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Typing indicator */}
                <AnimatePresence>
                  {isLoading && (
                    <motion.div
                      key="typing"
                      variants={fadeUp}
                      initial="hidden"
                      animate="show"
                      exit="exit"
                      className="flex gap-3"
                    >
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center
                        rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-[10px] font-bold text-white">
                        AI
                      </div>
                      <div>
                        <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                          AI Assistant
                        </p>
                        <div className="flex items-center gap-1">
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-blue-500" />
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-blue-500" />
                          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-blue-500" />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </section>

        {/* ── Input bar ───────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 sm:px-5">
          <div className="mx-auto max-w-3xl">
            <div className="input-glow overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors duration-150">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Message AI Assistant…"
                className="block min-h-[52px] w-full resize-none bg-transparent
                  px-4 pt-[14px] text-[13px] text-slate-800 outline-none
                  placeholder:text-slate-400 leading-6"
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-1">
                  <button className="flex h-7 w-7 items-center justify-center rounded-lg
                    text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <span className="ml-1 hidden text-[9px] font-medium uppercase tracking-wider text-slate-300 sm:block">
                    Enter to send · Shift+Enter for newline
                  </span>
                </div>

                <motion.button
                  onClick={isLoading ? stopGenerating : sendMessage}
                  disabled={!isLoading && !input.trim()}
                  whileTap={{ scale: 0.95 }}
                  className={`flex h-8 items-center gap-1.5 rounded-xl px-4 text-[11px] font-semibold transition-all duration-150
                    ${isLoading
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : input.trim()
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 hover:bg-blue-700"
                        : "bg-slate-100 text-slate-400"
                    }`}
                >
                  {isLoading ? (
                    <>
                      <span className="h-2.5 w-2.5 rounded-sm bg-white" />
                      Stop
                    </>
                  ) : (
                    <>
                      Send
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                      </svg>
                    </>
                  )}
                </motion.button>
              </div>
            </div>

            <p className="mt-2 text-center text-[9px] font-medium uppercase tracking-wider text-slate-300">
              AI can make mistakes — verify important information
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}
