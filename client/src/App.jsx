import { useState } from "react";

const initialChats = [
  {
    id: 1,
    title: "React Hooks",
    preview: "Explain useEffect...",
    time: "2m ago",
  },
  {
    id: 2,
    title: "JavaScript Interview",
    preview: "What are closures?",
    time: "1h ago",
  },
  {
    id: 3,
    title: "Portfolio Ideas",
    preview: "Help me build a...",
    time: "Yesterday",
  },
];

const suggestions = [
  {
    icon: "⚛",
    title: "Learn React",
    text: "Explain React hooks simply",
  },
  {
    icon: "⌘",
    title: "Write code",
    text: "Create a JavaScript function",
  },
  {
    icon: "◈",
    title: "Prepare interview",
    text: "Give me a frontend interview",
  },
  {
    icon: "✦",
    title: "Brainstorm",
    text: "Give me project ideas",
  },
];

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chats, setChats] = useState(initialChats);
  const [activeChat, setActiveChat] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sendMessage = () => {
    if (!input.trim()) return;

    const userMessage = input.trim();

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: "user",
        content: userMessage,
      },
      {
        id: Date.now() + 1,
        role: "assistant",
        content:
          "Hello! I'm Nova AI. Your message has been received. We'll connect the real AI backend next. 🚀",
      },
    ]);

    if (!activeChat) {
      const newChat = {
        id: Date.now(),
        title:
          userMessage.length > 25
            ? userMessage.substring(0, 25) + "..."
            : userMessage,
        preview: userMessage,
        time: "Just now",
      };

      setChats((prev) => [newChat, ...prev]);
      setActiveChat(newChat.id);
    }

    setInput("");
  };

  const handleSuggestion = (text) => {
    setInput(text);
  };

  const createNewChat = () => {
    setMessages([]);
    setInput("");
    setActiveChat(null);
    setSidebarOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="app-shell">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <div className="brand">
            <div className="brand-icon">✦</div>

            <div>
              <h1>Nova</h1>
              <span>AI Assistant</span>
            </div>
          </div>

          <button
            className="close-sidebar"
            onClick={() => setSidebarOpen(false)}
          >
            ×
          </button>
        </div>

        <button className="new-chat-button" onClick={createNewChat}>
          <span>＋</span>
          <span>New conversation</span>
        </button>

        <div className="search-box">
          <span>⌕</span>
          <input placeholder="Search conversations" />
          <kbd>⌘ K</kbd>
        </div>

        <div className="chat-section">
          <div className="section-label">Recent</div>

          <div className="chat-list">
            {chats.map((chat) => (
              <button
                key={chat.id}
                className={`chat-item ${
                  activeChat === chat.id ? "active" : ""
                }`}
                onClick={() => {
                  setActiveChat(chat.id);
                  setSidebarOpen(false);
                }}
              >
                <div className="chat-item-icon">◌</div>

                <div className="chat-item-content">
                  <strong>{chat.title}</strong>
                  <span>{chat.preview}</span>
                </div>

                <small>{chat.time}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-bottom">
          <button className="sidebar-link">
            <span>◐</span>
            Appearance
          </button>

          <button className="sidebar-link">
            <span>⚙</span>
            Settings
          </button>

          <div className="profile">
            <div className="avatar">S</div>

            <div className="profile-info">
              <strong>Sahil</strong>
              <span>Free plan</span>
            </div>

            <button className="profile-menu">•••</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        {/* Header */}
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>

          <div className="mobile-brand">
            <span>✦</span>
            Nova
          </div>

          <div className="model-selector">
            <div className="status-dot" />
            <span>Nova AI</span>
            <span className="chevron">⌄</span>
          </div>

          <div className="topbar-actions">
            <button className="icon-button" title="Share">
              ↗
            </button>

            <button className="icon-button" title="Settings">
              ⚙
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="chat-area">
          {messages.length === 0 ? (
            <div className="welcome-container">
              <div className="welcome-icon">
                <div className="welcome-icon-inner">✦</div>
              </div>

              <div className="welcome-text">
                <div className="eyebrow">YOUR AI ASSISTANT</div>

                <h2>
                  What can I help you
                  <span> build?</span>
                </h2>

                <p>
                  Ask questions, write code, brainstorm ideas,
                  <br />
                  or learn something new.
                </p>
              </div>

              <div className="suggestion-grid">
                {suggestions.map((suggestion) => (
                  <button
                    className="suggestion-card"
                    key={suggestion.title}
                    onClick={() => handleSuggestion(suggestion.text)}
                  >
                    <div className="suggestion-icon">
                      {suggestion.icon}
                    </div>

                    <div>
                      <strong>{suggestion.title}</strong>
                      <span>{suggestion.text}</span>
                    </div>

                    <span className="suggestion-arrow">↗</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages-container">
              {messages.map((message) => (
                <div
                  className={`message-row ${message.role}`}
                  key={message.id}
                >
                  {message.role === "assistant" && (
                    <div className="message-avatar">✦</div>
                  )}

                  <div className="message-content">
                    <div className="message-name">
                      {message.role === "user" ? "You" : "Nova"}
                    </div>

                    <div className="message-text">
                      {message.content}
                    </div>

                    {message.role === "assistant" && (
                      <div className="message-actions">
                        <button title="Copy">◇</button>
                        <button title="Regenerate">↻</button>
                        <button title="Like">♡</button>
                      </div>
                    )}
                  </div>

                  {message.role === "user" && (
                    <div className="message-avatar user-avatar">
                      S
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="composer-wrapper">
          <div className="composer">
            <div className="composer-top">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Nova..."
                rows="1"
              />
            </div>

            <div className="composer-bottom">
              <div className="composer-tools">
                <button title="Attach file">＋</button>

                <button title="Add image">▧</button>

                <span className="tool-divider" />

                <button className="model-pill">
                  ✦ Nova AI
                  <span>⌄</span>
                </button>
              </div>

              <div className="composer-actions">
                <button className="voice-button" title="Voice input">
                  ◉
                </button>

                <button
                  className={`send-button ${
                    input.trim() ? "ready" : ""
                  }`}
                  onClick={sendMessage}
                  disabled={!input.trim()}
                  title="Send message"
                >
                  ↑
                </button>
              </div>
            </div>
          </div>

          <div className="composer-footer">
            <span>Nova can make mistakes. Check important information.</span>
            <span className="shortcut-hint">
              Enter to send · Shift + Enter for new line
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;

