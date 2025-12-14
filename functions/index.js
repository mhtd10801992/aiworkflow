const functions = require("firebase-functions");
const fetch = globalThis.fetch || require("node-fetch");
const { GoogleAuth } = require("google-auth-library");

// Enable CORS for all origins
const cors = require("cors")({ origin: true });

// Use Generative Language API via REST. Model name here uses the Generative API model
// adjust `GENERATIVE_MODEL` if you have access to a different model.
const GENERATIVE_MODEL = "models/text-bison-001";
const GENERATIVE_ENDPOINT = `https://generativelanguage.googleapis.com/v1/${GENERATIVE_MODEL}:generateText`;

exports.parseWorkflow = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { description } = req.body;

      if (!description) {
        return res.status(400).json({ error: "description is required" });
      }

      const prompt = `Convert the following workflow into Mermaid flowchart syntax.\nIdentify agents, dependencies, and flow direction.\n\nWorkflow:\n${description}\n\nOutput ONLY Mermaid code.`;

      // Acquire access token via ADC
      const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
      const client = await auth.getClient();
      const accessToken = (await client.getAccessToken()).token || (await client.getAccessToken());

      const response = await fetch(GENERATIVE_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: { text: prompt },
          temperature: 0.2,
          maxOutputTokens: 1200
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error("Generative API error:", response.status, errBody);
        return res.status(502).json({ error: `Generative API error: ${response.status}` });
      }

      const json = await response.json();
      // response.candidates[0].output is typical; handle multiple shapes defensively
      const mermaid = json?.candidates?.[0]?.output || json?.output?.[0]?.content || json?.candidates?.[0]?.content || json?.text || "";

      if (!mermaid) {
        console.error('Generative API returned empty output', JSON.stringify(json));
        return res.status(502).json({ error: "Generative API returned empty output" });
      }

      res.json({ mermaid });
    } catch (err) {
      console.error("Error in parseWorkflow:", err);
      res.status(500).json({ error: err.message || "Internal server error" });
    }
  });
});