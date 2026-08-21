const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");
const axios = require("axios");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
const multer = require("multer");
const pdfParse = require("pdf-parse");

const upload = multer({
storage: multer.memoryStorage(),
limits: {
fileSize: 10 * 1024 * 1024, // 10 MB
},
});


const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Health check
app.get("/", (req, res) => {
  res.json({ success: true, message: "Chatbot backend is running 🚀" });
});

// =========================
// MEMORY API
// =========================
app.post("/api/memory", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !messages.trim()) {
      return res.status(400).json({ success: false, error: "Message is required" });
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
      model: "gemini-3.6-flash",
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
    console.error("Memory API Error:", error);
    res.status(500).json({ success: false, error: "Failed to extract memory" });
  }
});
app.post("/api/memory/consolidate", async (req, res) => {
try {
const { memories = [] } = req.body;

if (!Array.isArray(memories) || memories.length === 0) {
  return res.json({
    success: true,
    memories: [],
  });
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
  model: "gemini-3.6-flash",
  contents: [
    {
      role: "user",
      parts: [{ text: prompt }],
    },
  ],
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

res.json({
  success: true,
  memories: cleanedMemories,
});

} catch (error) {
console.error("Memory consolidation error:", error);

res.status(500).json({
  success: false,
  error: "Failed to consolidate memories",
});

}
});
app.post("/api/documents/upload", upload.single("document"), async (req, res) => {
try {
if (!req.file) {
return res.status(400).json({
success: false,
error: "PDF document is required",
});
}


if (req.file.mimetype !== "application/pdf") {
  return res.status(400).json({
    success: false,
    error: "Only PDF files are supported",
  });
}

const pdfData = await pdfParse(req.file.buffer);

const text = pdfData.text.trim();

if (!text) {
  return res.status(400).json({
    success: false,
    error: "Could not extract text from this PDF",
  });
}

res.json({
  success: true,
  document: {
    name: req.file.originalname,
    size: req.file.size,
    pages: pdfData.numpages,
    text,
  },
});


} catch (error) {
console.error("PDF upload error:", error);


res.status(500).json({
  success: false,
  error: "Failed to process PDF",
});


}
});


// =========================
// CHAT API
// =========================
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [], memories = [],useWeb = false } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    // Build conversation history in Gemini format
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

    // Add current message if not already at end
    const lastMessage = contents[contents.length - 1];
    if (
      !lastMessage ||
      lastMessage.role !== "user" ||
      lastMessage.parts[0].text !== message
    ) {
      contents.push({ role: "user", parts: [{ text: message }] });
    }

    // Inject memory context at the beginning
    if (memories.length > 0) {
      const memoryContext = `The following are long-term memories about the user. Use them only when relevant. Do not mention that you have a memory system unless the user asks.\n\nUser memories:\n${memories.map((m) => `- ${m}`).join("\n")}`;

      contents.unshift({
        role: "model",
        parts: [{ text: "Understood. I will use these memories when relevant." }],
      });
      contents.unshift({
        role: "user",
        parts: [{ text: memoryContext }],
      });
    }
    // =========================
// AUTOMATIC WEB SEARCH DETECTION
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
];

const lowerMessage = message.toLowerCase();

const shouldSearchWeb = webSearchKeywords.some((keyword) =>
  lowerMessage.includes(keyword)
);

console.log(
  `Web search: ${shouldSearchWeb ? "YES 🌐" : "NO 🧠"} → ${message}`
);
    // =========================
// WEB SEARCH CONTEXT
// =========================

let webContext = "";

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

    webContext = `
The user requested web search.

Use the following live web search results to answer the user's question.
Prefer information from these results over outdated knowledge.

Web search answer:
${searchData.answer || "No direct answer found."}

Web sources:
${(searchData.results || [])
  .map(
    (result, index) =>
      `${index + 1}. ${result.title}
URL: ${result.url}
Content: ${result.content}`
  )
  .join("\n\n")}

Important:
- Do not invent information.
- If the search results are insufficient, say so.
- Mention relevant sources naturally in your answer.
`;

    contents.unshift({
      role: "user",
      parts: [{ text: webContext }],
    });

    contents.unshift({
      role: "model",
      parts: [
        {
          text: "Understood. I will use the provided web search results when answering.",
        },
      ],
    });
  } catch (searchError) {
    console.error(
      "Web search inside chat failed:",
      searchError.response?.data || searchError.message
    );
  }
}

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
    });

    res.json({ success: true, reply: response.text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ success: false, error: "Failed to generate AI response" });
  }
});
// =========================
// WEB SEARCH API
// =========================
app.post("/api/search", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        error: "Search query is required",
      });
    }

    const response = await axios.post(
      "https://api.tavily.com/search",
      {
        api_key: process.env.TAVILY_API_KEY,
        query: query.trim(),
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

    res.json({
      success: true,
      answer: response.data.answer,
      results: response.data.results,
    });
  } catch (error) {
    console.error(
      "Tavily Search Error:",
      error.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      error: "Web search failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} 🚀`);
});
