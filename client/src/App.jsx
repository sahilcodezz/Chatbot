import { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const STORAGE_KEY = "ai-chat-history";
const MEMORY_KEY = "ai-chat-memories";

const suggestions = [
  {
    icon: "⚛",
    title: "Learn React",
    text: "Explain React hooks simply",
  },
  {
    icon: "</>",
    title: "Write code",
    text: "Create a JavaScript function",
  },
  {
    icon: "✦",
    title: "Prepare interview",
    text: "Give me a frontend interview",
  },
  {
    icon: "◈",
    title: "Brainstorm",
    text: "Give me project ideas",
  },
];

function App() {
  const [chats, setChats] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [memories, setMemories] = useState(() => {
    try {
      const saved = localStorage.getItem(MEMORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const extraMemory = async (userText) => {
    try {
      const response = await fetch("http://localhost:5000/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: userText }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) return;

      if (data.shouldRemember && data.memory) {
        setMemories((prev) => {
          if (prev.includes(data.memory)) return prev;
          return [...prev, data.memory];
        });
      }
    } catch (error) {
      console.error("Memory extraction error:", error);
    }
  };
  

  const [activeChat, setActiveChat] = useState(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [feedback, setFeedback] = useState(() => {
    try {
      const saved = localStorage.getItem("ai-chat-feedback");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [searchQuery, setSearchQuery] = useState("");  // fix: was misnamed setsearchquery / searchquery
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Save chats
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  }, [chats]);
  useEffect(() => {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memories));
  }, [memories]);

  const currentChat = chats.find((chat) => chat.id === activeChat);
  const messages = currentChat?.messages || [];

  // fix: .include → .includes, added return inside .some()
  const filteredChats = chats.filter((chat) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      chat.title?.toLowerCase().includes(query) ||
      chat.preview?.toLowerCase().includes(query) ||
      chat.messages?.some((message) =>
        message.content?.toLowerCase().includes(query)
      )
    );
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // =========================
  // STOP GENERATING
  // =========================

  const stopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  };

  // =========================
  // EDIT USER MESSAGE
  // =========================

  const startEdit = (message) => {
    setEditingId(message.id);
    setEditText(message.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const submitEdit = async (messageId) => {
    if (!editText.trim() || isLoading) return;

    const chat = chats.find((c) => c.id === activeChat);
    if (!chat) return;

    const messageIndex = chat.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    const newText = editText.trim();
    setEditingId(null);
    setEditText("");
    setIsLoading(true);

    const updatedMessages = chat.messages
      .slice(0, messageIndex + 1)
      .map((m) => (m.id === messageId ? { ...m, content: newText } : m));

    const history = updatedMessages.slice(0, messageIndex);

    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat ? { ...c, messages: updatedMessages } : c
      )
    );

    try {
      abortControllerRef.current = new AbortController();
      const response = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: newText, history }),
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to generate AI response");
      }

      const assistantMessage = {
        id: Date.now(),
        role: "assistant",
        content: data.reply,
      };

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat
            ? { ...c, messages: [...updatedMessages, assistantMessage] }
            : c
        )
      );
    } catch (error) {
      if (error.name === "AbortError") return; // stopped by user
      console.error("Edit error:", error);
      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat
            ? {
                ...c,
                messages: [
                  ...updatedMessages,
                  {
                    id: Date.now(),
                    role: "assistant",
                    content: "Unable to connect to the backend. Please make sure the server is running.",
                  },
                ],
              }
            : c
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // =========================
  // NEW CHAT
  // =========================

  const createNewChat = () => {
    setActiveChat(null);
    setInput("");
    setSidebarOpen(false);
  };

  // =========================
  // REGENERATE — fix: moved out of sendMessage, fixed variable names
  // =========================

  const regenerateResponse = async (assistantMessageId) => {
    if (isLoading || !activeChat) return;

    const chat = chats.find((c) => c.id === activeChat);
    if (!chat) return;

    const messageIndex = chat.messages.findIndex(
      (message) => message.id === assistantMessageId
    );
    if (messageIndex === -1) return;

    const assistantMessage = chat.messages[messageIndex];
    if (assistantMessage.role !== "assistant") return;

    const userMessage = [...chat.messages]
      .slice(0, messageIndex)
      .reverse()
      .find((message) => message.role === "user");

    if (!userMessage) return;

    const userIndex = chat.messages.findIndex(
      (message) => message.id === userMessage.id
    );

    const history = chat.messages.slice(0, userIndex);

    setIsLoading(true);

    try {
      abortControllerRef.current = new AbortController();
      const response = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content, history }),
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to regenerate response");
      }

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat
            ? {
                ...c,
                messages: c.messages.map((message) =>
                  message.id === assistantMessageId
                    ? { ...message, content: data.reply }
                    : message
                ),
              }
            : c
        )
      );
    } catch (error) {
      if (error.name === "AbortError") return; // stopped by user
      console.error("Regenerate error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // =========================
  // FEEDBACK — fix: moved out of sendMessage
  // =========================

  const handleFeedback = (messageId, type) => {
    setFeedback((prev) => {
      const updated = {
        ...prev,
        [messageId]: prev[messageId] === type ? null : type,
      };
      localStorage.setItem("ai-chat-feedback", JSON.stringify(updated));
      return updated;
    });
  };

  // =========================
  // SEND MESSAGE
  // =========================

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput("");
    setIsLoading(true);
    extraMemory(userText)

    const chatId = activeChat || Date.now();

    const userMessage = {
      id: Date.now(),
      role: "user",
      content: userText,
    };

    const previousMessages =
      chats.find((chat) => chat.id === chatId)?.messages || [];

    const chatHistory = [...previousMessages, userMessage];

    if (!activeChat) {
      const newChat = {
        id: chatId,
        title:
          userText.length > 30
            ? userText.substring(0, 30) + "..."
            : userText,
        preview: userText,
        time: "Now",
        messages: [userMessage],
      };
      setChats((prev) => [newChat, ...prev]);
      setActiveChat(chatId);
    } else {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                preview: userText,
                time: "Now",
                messages: [...(chat.messages || []), userMessage],
              }
            : chat
        )
      );
    }

    try {
      abortControllerRef.current = new AbortController();
      const response = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
           message: userText, 
           history: chatHistory,
           memories,
          }),
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to generate AI response");
      }

      const assistantMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: data.reply,
      };

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...(chat.messages || []), assistantMessage],
              }
            : chat
        )
      );
    } catch (error) {
      if (error.name === "AbortError") return; // stopped by user
      console.error("Chat error:", error);

      const errorMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content:
          "Unable to connect to the backend. Please make sure the server is running.",
      };

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...(chat.messages || []), errorMessage],
              }
            : chat
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // =========================
  // ENTER KEY
  // =========================

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // =========================
  // OPEN CHAT
  // =========================

  const openChat = (chatId) => {
    setActiveChat(chatId);
    setSidebarOpen(false);
  };

  // =========================
  // DELETE CHAT
  // =========================

  const deleteChat = (chatId, e) => {
    e.stopPropagation();
    setChats((prev) => prev.filter((chat) => chat.id !== chatId));
    if (activeChat === chatId) setActiveChat(null);
  };

  // =========================
  // COPY MESSAGE
  // =========================

  const copyMessage = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (error) {
      console.error(error);
    }
  };

  const copyCode = async (code, id) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (error) {
      console.error("Failed to copy code:", error);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] text-slate-900">

      {/* MOBILE OVERLAY */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-[270px]
          flex-col border-r border-slate-200 bg-white
          transition-transform duration-300
          lg:relative lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >

        {/* LOGO */}
        <div className="flex h-[72px] items-center border-b border-slate-100 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-600/20">
              AI
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">AI Assistant</h1>
              <p className="text-[10px] text-slate-400">Intelligent workspace</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto text-xl text-slate-400 lg:hidden"
          >
            ×
          </button>
        </div>

        {/* NEW CHAT */}
        <div className="p-4">
          <button
            onClick={createNewChat}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-medium text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700"
          >
            <span className="text-lg">+</span>
            New conversation
          </button>
        </div>

        {/* SEARCH */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-blue-300 focus-within:bg-white">
            <span className="text-sm text-slate-400">🔎</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* WORKSPACE */}
        <div className="px-3">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>
          <button className="flex w-full items-center gap-3 rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-700">
            <span>💬</span>
            Conversations
            <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-[9px]">
              {chats.length}
            </span>
          </button>
        </div>

        {/* CHAT LIST */}
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3">
          <div className="mb-2 flex items-center justify-between px-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Recent
            </p>
            <span className="text-[9px] text-slate-300">{chats.length}</span>
          </div>

          {filteredChats.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-300">
                💬
              </div>
              <p className="text-xs font-medium text-slate-500">
                {searchQuery ? "No conversations found" : "No conversations yet"}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                {searchQuery
                  ? "Try a different search"
                  : "Start your first conversation"}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => openChat(chat.id)}
                  className={`
                    group flex cursor-pointer items-start gap-3
                    rounded-xl p-3 transition
                    ${activeChat === chat.id ? "bg-blue-50" : "hover:bg-slate-50"}
                  `}
                >
                  <div
                    className={`
                      mt-0.5 flex h-8 w-8 shrink-0
                      items-center justify-center rounded-lg
                      ${
                        activeChat === chat.id
                          ? "bg-blue-100 text-blue-600"
                          : "bg-slate-100 text-slate-400"
                      }
                    `}
                  >
                    💬
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-700">
                      {chat.title}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-slate-400">
                      {chat.preview}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteChat(chat.id, e)}
                    className="hidden text-xs text-slate-300 hover:text-red-500 group-hover:block"
                    title="Delete conversation"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SIDEBAR BOTTOM */}
        <div className="border-t border-slate-100 p-3">
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-slate-500 hover:bg-slate-50">
            ⚙ Settings
          </button>
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-slate-500 hover:bg-slate-50">
            ? Help & Support
          </button>
          <div className="mt-2 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              S
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-slate-700">Sahil</p>
              <p className="text-[10px] text-slate-400">Free plan</p>
            </div>
            <span className="text-slate-400">•••</span>
          </div>
        </div>

      </aside>

      {/* MAIN */}
      <main className="flex min-w-0 flex-1 flex-col">

        {/* TOP BAR */}
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 lg:hidden"
            >
              ☰
            </button>
            <div>
              <h2 className="text-sm font-semibold text-slate-800">
                {currentChat?.title || "New conversation"}
              </h2>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] text-slate-400">AI online</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-medium text-slate-600 shadow-sm sm:flex">
              Gemini <span className="text-slate-400">⌄</span>
            </button>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
              ↗
            </button>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
              ⚙
            </button>
          </div>
        </header>

        {/* CHAT AREA */}
        <section className="min-h-0 flex-1 overflow-y-auto">

          {messages.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center px-5 py-10">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-2xl text-blue-600 ring-8 ring-blue-50/50">
                ✦
              </div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600">
                AI WORKSPACE
              </p>
              <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                How can I help you today?
              </h2>
              <p className="mt-3 max-w-lg text-center text-sm leading-6 text-slate-400">
                Ask questions, write code, prepare for interviews, or brainstorm
                your next project.
              </p>

              {/* SUGGESTIONS */}
              <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                {suggestions.map((item) => (
                  <button
                    key={item.title}
                    onClick={() => setInput(item.text)}
                    className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-semibold text-blue-600">
                      {item.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-700">
                        {item.title}
                      </p>
                      <p className="mt-1 truncate text-[10px] text-slate-400">
                        {item.text}
                      </p>
                    </div>
                    <span className="text-slate-300 transition group-hover:text-blue-500">
                      →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
              <div className="space-y-8">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === "user" ? "justify-end" : ""
                    }`}
                  >

                    {/* AI AVATAR */}
                    {message.role === "assistant" && (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-xs font-bold text-white">
                        AI
                      </div>
                    )}

                    <div
                      className={`max-w-[80%] ${
                        message.role === "user" ? "flex flex-col items-end" : ""
                      }`}
                    >
                      <div className="mb-1.5 text-[10px] font-semibold text-slate-400">
                        {message.role === "user" ? "You" : "AI Assistant"}
                      </div>

                      {/* USER MESSAGE — inline edit or bubble */}
                      {message.role === "user" ? (
                        editingId === message.id ? (
                          <div className="w-full min-w-[260px]">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  submitEdit(message.id);
                                }
                                if (e.key === "Escape") cancelEdit();
                              }}
                              rows={3}
                              className="w-full rounded-2xl rounded-br-md border border-blue-400 bg-white px-4 py-3 text-sm text-slate-700 outline-none ring-2 ring-blue-100 focus:ring-blue-300"
                              autoFocus
                            />
                            <div className="mt-1.5 flex justify-end gap-2">
                              <button
                                onClick={cancelEdit}
                                className="rounded-lg px-3 py-1 text-[10px] text-slate-500 hover:bg-slate-100"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => submitEdit(message.id)}
                                disabled={!editText.trim() || isLoading}
                                className="rounded-lg bg-blue-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                              >
                                Send
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="group relative">
                            <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-blue-600 px-4 py-3 text-sm leading-7 text-white shadow-sm">
                              {message.content}
                            </div>
                            {/* hover actions */}
                            <div className="mt-1 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                onClick={() => copyMessage(message.content, message.id)}
                                className="rounded-lg px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                              >
                                {copiedId === message.id ? "✓ Copied" : "Copy"}
                              </button>
                              <button
                                onClick={() => startEdit(message)}
                                className="rounded-lg px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                              >
                                ✎ Edit
                              </button>
                            </div>
                          </div>
                        )
                      ) : (
                          <div className="text-sm leading-7 text-slate-700">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ inline, className, children, ...props }) {
                                const codeText = String(children).replace(
                                  /\n$/,
                                  ""
                                );
                                const codeId = `code-${message.id}`;

                                if (inline) {
                                  return (
                                    <code
                                      className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-blue-600"
                                      {...props}
                                    >
                                      {children}
                                    </code>
                                  );
                                }

                                return (
                                  <div className="my-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
                                    <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
                                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                                        Code
                                      </span>
                                      <button
                                        onClick={() =>
                                          copyCode(codeText, codeId)
                                        }
                                        className="rounded-lg px-2.5 py-1 text-[10px] font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white"
                                      >
                                        {copiedId === codeId
                                          ? "✓ Copied"
                                          : "Copy"}
                                      </button>
                                    </div>
                                    <pre className="overflow-x-auto p-4 text-sm text-slate-100">
                                      <code className={className} {...props}>
                                        {children}
                                      </code>
                                    </pre>
                                  </div>
                                );
                              },
                              p({ children }) {
                                return (
                                  <div className="mb-3 last:mb-0">{children}</div>
                                );
                              },
                              ul({ children }) {
                                return (
                                  <ul className="mb-3 ml-5 list-disc space-y-1">
                                    {children}
                                  </ul>
                                );
                              },
                              ol({ children }) {
                                return (
                                  <ol className="mb-3 ml-5 list-decimal space-y-1">
                                    {children}
                                  </ol>
                                );
                              },
                              strong({ children }) {
                                return (
                                  <strong className="font-semibold text-slate-900">
                                    {children}
                                  </strong>
                                );
                              },
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                          </div>
                        )}

                      {/* AI ACTIONS */}
                      {message.role === "assistant" && (
                        <div className="mt-2 flex gap-1">
                          <button
                            onClick={() =>
                              copyMessage(message.content, message.id)
                            }
                            className="rounded-lg px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            {copiedId === message.id ? "✓ Copied" : "Copy"}
                          </button>

                          <button
                            onClick={() => regenerateResponse(message.id)}
                            disabled={isLoading}
                            className="rounded-lg px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                          >
                            ↻ Regenerate
                          </button>

                          <button
                            onClick={() => handleFeedback(message.id, "like")}
                            className={`rounded-lg px-2 py-1 text-sm transition ${
                              feedback[message.id] === "like"
                                ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                                : "text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                            }`}
                            title="Like"
                          >
                            👍
                          </button>

                          <button
                            onClick={() =>
                              handleFeedback(message.id, "dislike")
                            }
                            className={`rounded-lg px-2 py-1 text-sm transition ${
                              feedback[message.id] === "dislike"
                                ? "bg-red-100 text-red-600 ring-1 ring-red-300"
                                : "text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                            }`}
                            title="Dislike"
                          >
                            👎
                          </button>
                        </div>
                      )}
                    </div>

                    {/* USER AVATAR */}
                    {message.role === "user" && (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white">
                        S
                      </div>
                    )}
                  </div>
                ))}

                {/* LOADING */}
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-xs font-bold text-white">
                      AI
                    </div>
                    <div>
                      <p className="mb-2 text-[10px] font-semibold text-slate-400">
                        AI Assistant
                      </p>
                      <div className="flex gap-1.5">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:150ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />

        </section>

        {/* MESSAGE INPUT */}
        <div className="w-full border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Message your AI assistant..."
                className="block max-h-36 min-h-[56px] w-full resize-none border-0 bg-transparent px-4 pt-4 text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-1">
                  <button className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-400 hover:bg-slate-100">
                    +
                  </button>
                  <button className="flex h-8 w-8 items-center justify-center rounded-lg text-sm text-slate-400 hover:bg-slate-100">
                    ▧
                  </button>
                  <span className="ml-2 hidden text-[10px] text-slate-400 sm:block">
                    Enter to send · Shift + Enter for new line
                  </span>
                </div>
                <button
                  onClick={isLoading ? stopGenerating : sendMessage}
                  disabled={!isLoading && !input.trim()}
                  className={`
                    flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-semibold transition
                    ${
                      isLoading
                        ? "bg-red-500 text-white shadow-md shadow-red-500/20 hover:bg-red-600"
                        : input.trim()
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 hover:bg-blue-700"
                        : "bg-slate-100 text-slate-400"
                    }
                  `}
                >
                  {isLoading ? (
                    <>
                      <span className="h-3 w-3 rounded-sm bg-white" />
                      Stop
                    </>
                  ) : (
                    <>
                      Send <span>↑</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            <p className="mt-2 text-center text-[9px] text-slate-400">
              AI can make mistakes. Please verify important information.
            </p>
          </div>
        </div>

      </main>

    </div>
  );
}

export default App;
