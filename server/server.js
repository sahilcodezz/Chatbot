const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const dns = require("dns");
const { GoogleGenAI } = require("@google/genai");
const axios = require("axios");
const mongoose = require("mongoose");

// Fix for querySrv ECONNREFUSED on Windows / local ISP DNS
dns.setServers(["8.8.8.8", "8.8.4.4"]);

dotenv.config();
console.log("MongoDB URI loaded:", !!process.env.MONGODB_URI);

const app = express();

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected successfully ✅");
  })
  .catch((error) => {
    console.error("MongoDB connection failed ❌", error.message);
  });
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
const authRoutes = require("./routes/auth");
const authMiddleware = require("./middleware/middleware");

app.use("/api/auth", authRoutes);

app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: "You accessed a protected route 🔐",
    userId: req.user.userId,
  });
});
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
const calculateTool = {
  name: "calculate",
  description:
    "Perform mathematical calculations when the user asks for arithmetic.",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description:
          "A mathematical expression such as 25 * 4 + 10 or (100 / 5) + 7",
      },
    },
    required: ["expression"],
  },
};

const webSearchTool = {
  name: "web_search",
  description:
    "Search the live web when the user asks for current, latest, recent, news, prices, weather, stock information, or other information that may have changed.",
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
    const { evaluate } = require("mathjs");

    const result = evaluate(expression);

    return {
      success: true,
      result: String(result),
    };
  } catch (error) {
    return {
      success: false,
      result: "Invalid mathematical expression",
    };
  }
}

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
      model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

    const functionCall = response.functionCalls?.[0];

if (functionCall) {
  console.log("🔧 Tool called:", functionCall.name);
  console.log("📦 Arguments:", functionCall.args);

  let toolResult;

  if (functionCall.name === "calculate") {
    toolResult = calculateExpression(
      functionCall.args.expression
    );
  }

  contents.push(response.candidates[0].content);

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

  const finalResponse = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
    contents,
    config: {
      tools: [
        {
          functionDeclarations: [calculateTool,webSearchTool],
        },
      ],
    },
  });

  return res.json({
    success: true,
    reply: finalResponse.text,
  });
}

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
  model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
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
    const {
      message,
      history = [],
      memories = [],
    } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: "Message is required",
      });
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

    console.log(
      `Web search: ${
        shouldSearchWeb ? "YES 🌐" : "NO 🧠"
      } → ${message}`
    );

    // =========================
    // TAVILY WEB SEARCH
    // =========================

    if (shouldSearchWeb) {
      try {
        console.log("🔎 Searching Tavily...");

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

        // =========================
        // DEBUG SEARCH RESULTS
        // =========================

        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("🌐 TAVILY SEARCH COMPLETED");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        console.log(
          "📝 Tavily Answer:",
          searchData.answer || "No direct answer found."
        );

        console.log("📚 Tavily Results:");

        (searchData.results || []).forEach((result, index) => {
          console.log(`\n${index + 1}. ${result.title}`);
          console.log(`🔗 ${result.url}`);
          console.log(
            `📄 ${result.content?.substring(0, 500) || "No content"}`
          );
        });

        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        // =========================
        // BUILD WEB CONTEXT
        // =========================

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

        console.log("✅ Web context added to Gemini");
      } catch (searchError) {
        console.error(
          "❌ Web search inside chat failed:",
          searchError.response?.data || searchError.message
        );
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
      console.log("🔧 Tool called:", functionCall.name);
      console.log("📦 Arguments:", functionCall.args);

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
          console.log(
            "🌐 Gemini requested web search:",
            functionCall.args.query
          );

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

          console.log("✅ Gemini web search completed");
        } catch (searchError) {
          console.error(
            "❌ Web search tool failed:",
            searchError.response?.data ||
              searchError.message
          );

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
    console.error("Gemini API Error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to generate AI response",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} 🚀`);
});
