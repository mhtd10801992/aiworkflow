exports.workflowPrompt = (text) => `
Convert this workflow into Mermaid flowchart syntax.
Identify agents and dependencies.

Workflow:
${text}

Return ONLY Mermaid code.
`;
