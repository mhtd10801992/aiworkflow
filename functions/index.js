const functions = require("firebase-functions");
const fetch = globalThis.fetch || require("node-fetch");

// Enable CORS for all origins
const cors = require("cors")({ origin: true });

// OpenAI API configuration
const OPENAI_API_KEY = functions.config().openai?.key;
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

exports.parseWorkflow = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (!OPENAI_API_KEY) {
        console.error("OpenAI API key not configured");
        return res.status(500).json({ error: "OpenAI API key not configured" });
      }

      const { description } = req.body;

      if (!description) {
        return res.status(400).json({ error: "description is required" });
      }

      const prompt = `Convert the following workflow into Mermaid flowchart syntax.\nIdentify agents, dependencies, and flow direction.\n\nWorkflow:\n${description}\n\nOutput ONLY Mermaid code. Start with 'graph TD' or 'graph LR'.`;

      const response = await fetch(OPENAI_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a helpful assistant that converts workflows into Mermaid diagrams. Always output valid Mermaid syntax only, no explanations."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.2,
          max_tokens: 1200
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error("OpenAI API error:", response.status, errBody);
        return res.status(502).json({ error: `OpenAI API error: ${response.status}` });
      }

      const json = await response.json();
      const mermaid = json?.choices?.[0]?.message?.content || "";

      if (!mermaid) {
        console.error('OpenAI returned empty output', JSON.stringify(json));
        return res.status(502).json({ error: "OpenAI returned empty output" });
      }

      res.json({ mermaid });
    } catch (err) {
      console.error("Error in parseWorkflow:", err);
      res.status(500).json({ error: err.message || "Internal server error" });
    }
  });
});