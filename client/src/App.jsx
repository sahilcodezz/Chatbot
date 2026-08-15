import { useEffect, useState,useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const STORAGE_KEY = "ai-chat-history";

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

  const [activeChat, setActiveChat] = useState(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);

  // Save chats
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  }, [chats]);

  const currentChat = chats.find(
    (chat) => chat.id === activeChat
  );

  const messages = currentChat?.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  // =========================
  // NEW CHAT
  // =========================

  const createNewChat = () => {
    setActiveChat(null);
    setInput("");
    setSidebarOpen(false);
  };

  // =========================
  // SEND MESSAGE
  // =========================

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput("");
    setIsLoading(true);

    const chatId = activeChat || Date.now();

    const userMessage = {
      id: Date.now(),
      role: "user",
      content: userText,
    };

    // Get previous messages BEFORE updating state
    const previousMessages =
      chats.find((chat) => chat.id === chatId)?.messages || [];

    // Complete history including current message
    const chatHistory = [
      ...previousMessages,
      userMessage,
    ];

    // =========================
    // CREATE / UPDATE CHAT
    // =========================

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
                messages: [
                  ...(chat.messages || []),
                  userMessage,
                ],
              }
            : chat
        )
      );
    }

    // =========================
    // API REQUEST
    // =========================

    try {
      const response = await fetch(
        "http://localhost:5000/api/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: userText,
            history: chatHistory,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Failed to generate AI response"
        );
      }

      const assistantMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: data.reply,
      };

      // Add AI response
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [
                  ...(chat.messages || []),
                  assistantMessage,
                ],
              }
            : chat
        )
      );
    } catch (error) {
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
                messages: [
                  ...(chat.messages || []),
                  errorMessage,
                ],
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

    setChats((prev) =>
      prev.filter((chat) => chat.id !== chatId)
    );

    if (activeChat === chatId) {
      setActiveChat(null);
    }
  };

  // =========================
  // COPY MESSAGE
  // =========================

  const copyMessage = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);

      setCopiedId(id);

      setTimeout(() => {
        setCopiedId(null);
      }, 1500);
    } catch (error) {
      console.error(error);
    }
  };
  const copyCode = async (code, id) => {
  try {
    await navigator.clipboard.writeText(code);

    setCopiedId(id);

    setTimeout(() => {
      setCopiedId(null);
    }, 1500);
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
          ${
            sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full"
          }
        `}
      >

        {/* LOGO */}

        <div className="flex h-[72px] items-center border-b border-slate-100 px-5">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-600/20">
              AI
            </div>

            <div>
              <h1 className="text-sm font-bold text-slate-900">
                AI Assistant
              </h1>

              <p className="text-[10px] text-slate-400">
                Intelligent workspace
              </p>
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

            <span className="text-[9px] text-slate-300">
              {chats.length}
            </span>

          </div>

          {chats.length === 0 ? (

            <div className="px-3 py-8 text-center">

              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-300">
                💬
              </div>

              <p className="text-xs font-medium text-slate-500">
                No conversations yet
              </p>

              <p className="mt-1 text-[10px] text-slate-400">
                Start your first conversation
              </p>

            </div>

          ) : (

            <div className="space-y-1">

              {chats.map((chat) => (

                <div
                  key={chat.id}
                  onClick={() => openChat(chat.id)}
                  className={`
                    group flex cursor-pointer items-start gap-3
                    rounded-xl p-3 transition
                    ${
                      activeChat === chat.id
                        ? "bg-blue-50"
                        : "hover:bg-slate-50"
                    }
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
                    onClick={(e) =>
                      deleteChat(chat.id, e)
                    }
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
            ⚙
            Settings
          </button>

          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-slate-500 hover:bg-slate-50">
            ?
            Help & Support
          </button>

          <div className="mt-2 flex items-center gap-3 rounded-xl bg-slate-50 p-3">

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              S
            </div>

            <div className="flex-1">

              <p className="text-xs font-semibold text-slate-700">
                Sahil
              </p>

              <p className="text-[10px] text-slate-400">
                Free plan
              </p>

            </div>

            <span className="text-slate-400">
              •••
            </span>

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

                <span className="text-[10px] text-slate-400">
                  AI online
                </span>

              </div>

            </div>

          </div>

          <div className="flex items-center gap-2">

            <button className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-medium text-slate-600 shadow-sm sm:flex">
              Gemini
              <span className="text-slate-400">
                ⌄
              </span>
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
                Ask questions, write code, prepare for interviews,
                or brainstorm your next project.
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
                      message.role === "user"
                        ? "justify-end"
                        : ""
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
                        message.role === "user"
                          ? "flex flex-col items-end"
                          : ""
                      }`}
                    >

                      <p className="mb-1.5 text-[10px] font-semibold text-slate-400">
                        {message.role === "user"
                          ? "You"
                          : "AI Assistant"}
                      </p>

                      <div
  className={`
    text-sm leading-7
    ${
      message.role === "user"
        ? "whitespace-pre-wrap rounded-2xl rounded-br-md bg-blue-600 px-4 py-3 text-white shadow-sm"
        : "text-slate-700"
    }
  `}
>
  {message.role === "assistant" ? (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
       code({ inline, className, children, ...props }) {
  const codeText = String(children).replace(/\n$/, "");
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
          onClick={() => copyCode(codeText, codeId)}
          className="rounded-lg px-2.5 py-1 text-[10px] font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white"
        >
          {copiedId === codeId ? "✓ Copied" : "Copy"}
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
          return <p className="mb-3 last:mb-0">{children}</p>;
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
  ) : (
    message.content
  )}
</div>

                      {/* AI ACTIONS */}

                      {message.role === "assistant" && (

                        <div className="mt-2 flex gap-1">

                          <button
                            onClick={() =>
                              copyMessage(
                                message.content,
                                message.id
                              )
                            }
                            className="rounded-lg px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            {copiedId === message.id
                              ? "✓ Copied"
                              : "Copy"}
                          </button>

                          <button className="rounded-lg px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-100">
                            ↻ Regenerate
                          </button>

                          <button className="rounded-lg px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-100">
                            ♡
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
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  className={`
                    flex h-9 items-center gap-2 rounded-xl px-4 text-xs font-semibold transition
                    ${
                      input.trim() && !isLoading
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 hover:bg-blue-700"
                        : "bg-slate-100 text-slate-400"
                    }
                  `}
                >
                  {isLoading ? "Thinking..." : "Send"}
                  <span>↑</span>
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