const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const dns = require("dns");
const { GoogleGenAI } = require("@google/genai");
const axios = require("axios");
const mongoose = require("mongoose");
const { evaluate } = require("mathjs");

dns.setServers(["8.8.8.8", "8.8.4.4"]);
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security headers ────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── Gzip compression ────────────────────────────────────────────────────
app.use(compression());

// ── CORS (whitelist origins) ────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ── Body parser with size limit ─────────────────────────────────────────
app.use(express.json({ limit: "500kb" }));

// ── Rate limiting ───────────────────────────────────────────────────────
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests, please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many attempts, please try again later." },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests, please try again later." },
});
// ── MongoDB connection ───────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {})
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
  });

// ── Auth routes with rate limiting ──────────────────────────────────────
const authRoutes = require("./routes/auth");
const authMiddleware = require("./middleware/middleware");
app.use("/api/auth", authLimiter, authRoutes);

// ── File upload ──────────────────────────────────────────────────────────
const multer = require("multer");
const pdfParse = require("pdf-parse");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Health check
app.get("/", (req, res) => {
  res.json({ success: true, message: "Chatbot backend is running" });
});

const calculateTool = {
  name: "calculate",
  description: "Perform mathematical calculations when the user asks for arithmetic.",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "A mathematical expression such as 25 * 4 + 10 or (100 / 5) + 7",
      },
    },
    required: ["expression"],
  },
};

const webSearchTool = {
  name: "web_search",
  description: "Search the live web when the user asks for current, latest, recent, news, prices, weather, stock information, or other information that may have changed.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The exact search query to search on the web.",
      },
    },
    required: ["query"],
  },
};

function calculateExpression(expression) {
  try {
    const result = evaluate(expression);
    return { success: true, result: String(result) };
  } catch {
    return { success: false, result: "Invalid mathematical expression" };
  }
}

// =========================
// MEMORY API
// =========================
app.post("/api/memory", generalLimiter, async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !messages.trim()) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    if (messages.length > 5000) {
      return res.status(400).json({ success: false, error: "Message too long (max 5000 characters)" });
    }

    const prompt = `You are a memory extraction system.

Analyze the user's message and decide whether it contains useful long-term information about the user.

Good memories include: skills, learning goals, preferences, projects, long-term interests, work preferences.

Do NOT remember: temporary questions, general facts, one-time requests, passwords, API keys, sensitive information.

Return ONLY valid JSON in this exact format:
{"shouldRemember": true, "memory": "Short useful memory"}
OR
{"shouldRemember": false, "memory": null}

User message: "${messages}"`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    let text = response.text.trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const result = JSON.parse(text);

    res.json({
      success: true,
      shouldRemember: Boolean(result.shouldRemember),
      memory: result.memory || null,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to extract memory" });
  }
});
app.post("/api/memory/consolidate", generalLimiter, async (req, res) => {
  try {
    const { memories = [] } = req.body;

    if (!Array.isArray(memories) || memories.length === 0) {
      return res.json({ success: true, memories: [] });
    }

    if (memories.length > 100) {
      return res.status(400).json({ success: false, error: "Too many memories (max 100)" });
    }

    const prompt = `You are an AI memory management system.

Clean and consolidate the user's long-term memories.

Rules:
Merge duplicate or closely related memories.
Remove unnecessary repetition.
Keep useful skills, goals, preferences, projects, and long-term interests.
Never create information that is not present.
Do not store passwords, API keys, secrets, or sensitive personal information.
Keep each memory short and useful.
Return ONLY valid JSON.

Format:
{
"memories": [
"Short useful memory",
"Another useful memory"
]
}

Existing memories:
${memories.map((memory) => `- ${memory}`).join("\n")}`;

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    let text = response.text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const result = JSON.parse(text);

    const cleanedMemories = Array.isArray(result.memories)
      ? result.memories
          .filter((memory) => typeof memory === "string" && memory.trim())
          .map((memory) => memory.trim())
      : [];

    res.json({ success: true, memories: cleanedMemories });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to consolidate memories" });
  }
});
app.post("/api/documents/upload", generalLimiter, upload.single("document"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "PDF document is required" });
    }

    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ success: false, error: "Only PDF files are supported" });
    }

    const pdfData = await pdfParse(req.file.buffer);
    const text = pdfData.text.trim();

    if (!text) {
      return res.status(400).json({ success: false, error: "Could not extract text from this PDF" });
    }

    res.json({
      success: true,
      document: {
        name: req.file.originalname,
        size: req.file.size,
        pages: pdfData.numpages,
        text: text.substring(0, 50000),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to process PDF" });
  }
});


// =========================
// CHAT API
// =========================

app.post("/api/chat", chatLimiter, async (req, res) => {
  try {
    const {
      message,
      history = [],
      memories = [],
    } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    if (message.length > 10000) {
      return res.status(400).json({ success: false, error: "Message too long (max 10000 characters)" });
    }

    if (!Array.isArray(history) || history.length > 50) {
      return res.status(400).json({ success: false, error: "History too large (max 50 messages)" });
    }

    if (!Array.isArray(memories) || memories.length > 100) {
      return res.status(400).json({ success: false, error: "Too many memories (max 100)" });
    }

    // =========================
    // BUILD CONVERSATION HISTORY
    // =========================

    const contents = history
      .filter(
        (item) =>
          item &&
          (item.role === "user" || item.role === "assistant") &&
          item.content
      )
      .map((item) => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.content }],
      }));

    // Add current message if not already at the end
    const lastMessage = contents[contents.length - 1];

    if (
      !lastMessage ||
      lastMessage.role !== "user" ||
      lastMessage.parts[0].text !== message
    ) {
      contents.push({
        role: "user",
        parts: [{ text: message }],
      });
    }

    // =========================
    // MEMORY CONTEXT
    // =========================

    if (Array.isArray(memories) && memories.length > 0) {
      const memoryContext = `
The following are long-term memories about the user.

Use them only when relevant.
Do not mention the memory system unless the user asks.

User memories:
${memories.map((m) => `- ${m}`).join("\n")}
`;

      contents.unshift({
        role: "model",
        parts: [
          {
            text: "Understood. I will use these memories when relevant.",
          },
        ],
      });

      contents.unshift({
        role: "user",
        parts: [{ text: memoryContext }],
      });
    }

    // =========================
    // AUTOMATIC WEB SEARCH
    // =========================

    const webSearchKeywords = [
      "latest",
      "today",
      "current",
      "now",
      "recent",
      "news",
      "this week",
      "this month",
      "2026",
      "price",
      "weather",
      "stock",
      "release",
      "released",
      "new version",
      "what happened",
      "new song",
      "new album",
      "new movie",
      "new update",
      "new release",
    ];

    const lowerMessage = message.toLowerCase();

    const shouldSearchWeb = webSearchKeywords.some((keyword) =>
      lowerMessage.includes(keyword)
    );

    // =========================
    // TAVILY WEB SEARCH
    // =========================

    if (shouldSearchWeb) {
      try {
        const searchResponse = await axios.post(
          "https://api.tavily.com/search",
          {
            api_key: process.env.TAVILY_API_KEY,
            query: message.trim(),
            search_depth: "advanced",
            max_results: 5,
            include_answer: true,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        const searchData = searchResponse.data;

        const webContext = `
IMPORTANT: The user asked a question that may require current information.

Use the live web search results below to answer the user's question.

User question:
${message}

Tavily direct answer:
${searchData.answer || "No direct answer found."}

Live web search results:
${
  (searchData.results || [])
    .map(
      (result, index) => `
SOURCE ${index + 1}
Title: ${result.title}
URL: ${result.url}
Content:
${result.content}
`
    )
    .join("\n")
}

Instructions:
- Use the live search results to answer the user's question.
- Prefer current information from the search results over your old/general knowledge.
- Do not invent facts.
- If the search results contain a clear answer, give the answer confidently.
- If different sources disagree, mention the disagreement.
- If the results are insufficient, clearly say what is missing.
- When useful, mention the source name or provide the source URL.
`;

        // Put web context before the conversation
        contents.unshift({
          role: "model",
          parts: [
            {
              text: "Understood. I will use the live web search results to answer the user's question accurately.",
            },
          ],
        });

        contents.unshift({
          role: "user",
          parts: [
            {
              text: webContext,
            },
          ],
        });
      } catch (searchError) {
        // Web search failed, continue without it
      }
    }

    // =========================
    // GEMINI + TOOL CALLING
    // =========================

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-3.6-flash",

      contents,

      config: {
        tools: [
          {
            functionDeclarations: [
              calculateTool,
              webSearchTool,
            ],
          },
        ],
      },
    });

    // =========================
    // CHECK FOR TOOL CALL
    // =========================

    const functionCall = response.functionCalls?.[0];

    if (functionCall) {
      let toolResult;

      // =========================
      // CALCULATOR TOOL
      // =========================

      if (functionCall.name === "calculate") {
        toolResult = calculateExpression(
          functionCall.args.expression
        );
      }

      // =========================
      // WEB SEARCH TOOL
      // =========================

      else if (functionCall.name === "web_search") {
        try {
          const searchResponse = await axios.post(
            "https://api.tavily.com/search",
            {
              api_key: process.env.TAVILY_API_KEY,
              query: functionCall.args.query,
              search_depth: "advanced",
              max_results: 5,
              include_answer: true,
            },
            {
              headers: {
                "Content-Type": "application/json",
              },
            }
          );

          const searchData = searchResponse.data;

          toolResult = {
            success: true,

            answer:
              searchData.answer ||
              "No direct answer found.",

            results: (searchData.results || []).map(
              (result) => ({
                title: result.title,
                url: result.url,
                content: result.content,
              })
            ),
          };
        } catch (searchError) {
          toolResult = {
            success: false,
            error: "Web search failed",
          };
        }
      }

      // =========================
      // ADD GEMINI TOOL REQUEST
      // =========================

      contents.push(response.candidates[0].content);

      // =========================
      // ADD TOOL RESULT
      // =========================

      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: functionCall.name,
              response: toolResult,
            },
          },
        ],
      });

      // =========================
      // FINAL GEMINI RESPONSE
      // =========================

      const finalResponse = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.6-flash",

        contents,

        config: {
          tools: [
            {
              functionDeclarations: [
                calculateTool,
                webSearchTool,
              ],
            },
          ],
        },
      });

      return res.json({
        success: true,
        reply: finalResponse.text,
      });
    }

    // =========================
    // NORMAL RESPONSE
    // =========================

    return res.json({
      success: true,
      reply: response.text,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to generate AI response",
    });
  }
});

// ── Global error handler ────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  res.status(500).json({ success: false, error: "Internal server error" });
});

// ── Start server ────────────────────────────────────────────────────────
const server = app.listen(PORT);

// ── Graceful shutdown ───────────────────────────────────────────────────
const shutdown = () => {
  server.close(() => {
    mongoose.connection.close(false).then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
