const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Health check
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Chatbot backend is running 🚀",
  });
});

// Chat API
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: "Message is required",
      });
    }

    // Convert frontend history into Gemini conversation format
    const contents = history
      .filter(
        (item) =>
          item &&
          (item.role === "user" || item.role === "assistant") &&
          item.content
      )
      .map((item) => ({
        role: item.role === "assistant" ? "model" : "user",
        parts: [
          {
            text: item.content,
          },
        ],
      }));

    // If history doesn't contain the current message, add it
    const lastMessage = contents[contents.length - 1];

    if (
      !lastMessage ||
      lastMessage.role !== "user" ||
      lastMessage.parts[0].text !== message
    ) {
      contents.push({
        role: "user",
        parts: [
          {
            text: message,
          },
        ],
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
    });

    const reply = response.text;

    res.json({
      success: true,
      reply,
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