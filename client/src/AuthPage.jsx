import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API = `${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/auth`;

export default function AuthPage({ onAuth }) {
  const [mode, setMode]       = useState("login"); // "login" | "signup"
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = (m) => {
    setMode(m);
    setError("");
    setName("");
    setEmail("");
    setPassword("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Name is required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === "login" ? `${API}/login` : `${API}/register`;
      const body     = mode === "login"
        ? { email: email.trim(), password }
        : { name: name.trim(), email: email.trim(), password };

      const res  = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Something went wrong.");
        return;
      }

      // Save token + user to localStorage
      localStorage.setItem("auth-token", data.token);
      localStorage.setItem("auth-user",  JSON.stringify(data.user));
      onAuth(data.user, data.token);
    } catch {
      setError("Cannot connect to server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4">

      {/* Card */}
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0,  scale: 1 }}
        transition={{ duration: 0.32, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-100"
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-3 border-b border-slate-100 px-8 pt-8 pb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-[14px] font-bold text-white shadow-lg shadow-blue-200">
            AI
          </div>
          <div className="text-center">
            <h1 className="text-[18px] font-semibold tracking-tight text-slate-900">
              {mode === "login" ? "Welcome back" : "Create account"}
            </h1>
            <p className="mt-0.5 text-[12px] text-slate-400">
              {mode === "login"
                ? "Sign in to your AI Assistant"
                : "Start chatting with AI Assistant"}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {["login", "signup"].map((tab) => (
            <button
              key={tab}
              onClick={() => switchMode(tab)}
              className={`flex-1 py-3 text-[12px] font-semibold transition-colors duration-150
                ${mode === tab
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-400 hover:text-slate-600"
                }`}
            >
              {tab === "login" ? "Login" : "Sign Up"}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-8 py-6">

          {/* Name (signup only) */}
          <AnimatePresence>
            {mode === "signup" && (
              <motion.div
                key="name-field"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sahil Pandey"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5
                    text-[13px] text-slate-900 placeholder:text-slate-400
                    outline-none transition focus:border-blue-400 focus:bg-white
                    focus:ring-3 focus:ring-blue-100"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5
                text-[13px] text-slate-900 placeholder:text-slate-400
                outline-none transition focus:border-blue-400 focus:bg-white
                focus:ring-3 focus:ring-blue-100"
            />
          </div>

          {/* Password */}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Password
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 pr-10
                  text-[13px] text-slate-900 placeholder:text-slate-400
                  outline-none transition focus:border-blue-400 focus:bg-white
                  focus:ring-3 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                tabIndex={-1}
              >
                {showPass ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-600"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="flex h-10 items-center justify-center rounded-lg bg-blue-600 text-[13px]
              font-semibold text-white shadow-md shadow-blue-200 transition-all
              hover:bg-blue-700 active:scale-[0.98]
              disabled:opacity-60 disabled:pointer-events-none"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {mode === "login" ? "Signing in…" : "Creating account…"}
              </span>
            ) : (
              mode === "login" ? "Sign In" : "Create Account"
            )}
          </button>

          {/* Switch mode */}
          <p className="text-center text-[11px] text-slate-400">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => switchMode(mode === "login" ? "signup" : "login")}
              className="font-semibold text-blue-600 hover:underline"
            >
              {mode === "login" ? "Sign Up" : "Sign In"}
            </button>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
