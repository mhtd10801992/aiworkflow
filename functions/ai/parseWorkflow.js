const { VertexAI } = require("@google-cloud/vertexai");
const { workflowPrompt } = require("./prompts");

const vertexAI = new VertexAI({
  project: process.env.GCLOUD_PROJECT,
  location: "us-central1"
});

exports.parseWorkflow = async (req, res) => {
  try {
    const { description } = req.body;

    const model = vertexAI.preview.getGenerativeModel({
      model: "gemini-1.5-pro"
    });

    const result = await model.generateContent(
      workflowPrompt(description)
    );

    res.json({ mermaid: result.response.text() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
