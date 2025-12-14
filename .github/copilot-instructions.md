<!-- .github/copilot-instructions.md - Tailored guidance for AI coding agents -->

# AI Assistant Instructions — ai-workflow-tool

Purpose: quickly orient an AI coding agent so it can make safe, correct edits and run the project.

- Big picture

  - This is a Firebase-hosted web app: static frontend lives in `web/` (Create React App). The production build output is `web/build` and Firebase Hosting serves it (see `.firebase.json`).
  - A serverless HTTP function `parseWorkflow` (exported from `functions/index.js`) is used as the API endpoint. Firebase hosting rewrites `/api/**` to this function (`.firebase.json` / `functions/firebase.json`).
  - The function uses Google Vertex AI (`@google-cloud/vertexai`) to convert a natural-language workflow into Mermaid flowchart syntax.

- Key files to inspect before coding

  - `functions/index.js` — Firebase Functions entrypoint; exports `parseWorkflow` and shows expected request/response shape.
  - `functions/ai/parseWorkflow.js` and `functions/ai/prompts.js` — modular prompt & logic used to call Vertex AI. Use these when changing prompt templates or error handling.
  - `web/src/App.js` — example frontend: POSTs JSON `{ description }` and renders returned `mermaid` text into a `.mermaid` container. The existing code currently posts to an absolute Cloud Functions URL; prefer `/api/parseWorkflow` (relative) to use hosting rewrites during deployment.
  - `.firebase.json` / `.firebaserc` — hosting and rewrite config; `.firebaserc` sets the default Firebase project id.

- API contract (immutable unless coordinated)

  - Endpoint (deployed): POST /api/parseWorkflow (rewritten to `parseWorkflow` function).
  - Request body: JSON { "description": string }
  - Response: JSON { "mermaid": string } on success, or { "error": "message" } on failure.

- Environment & credentials

  - Vertex AI client expects Google Cloud credentials and `GCLOUD_PROJECT` (the code reads `process.env.GCLOUD_PROJECT`). When running locally, set `GOOGLE_APPLICATION_CREDENTIALS` and `GCLOUD_PROJECT` or run inside a GCP environment.
  - The function code references `gemini-1.5-pro` via the Vertex AI preview API — changing model names or APIs requires dependency and credential checks.

- Local dev and deployment workflows (discoverable commands)

  - Frontend dev: `cd web && npm install && npm start` (CRA dev server, port 3000).
  - Build frontend for hosting: `cd web && npm run build` → output `web/build` is served by Firebase Hosting.
  - Deploy to Firebase: `firebase deploy` (requires firebase-tools auth & project); `.firebaserc` selects `ai-workflow-tool` by default.
  - Local functions + hosting emulation: `firebase emulators:start` (recommended when testing rewrites); ensure env vars for Vertex AI are provided to the emulator.

- Code patterns & conventions to follow

  - Keep API surface stable: update `web/src/App.js` and `functions/*` together when changing request/response shapes.
  - Prompt templates live in `functions/ai/prompts.js`. Small changes to output format should be guarded with unit-like checks (e.g., validate Mermaid output before returning).
  - Error handling: functions should return JSON `{ error }` with proper status codes (see `functions/ai/parseWorkflow.js` pattern).

- Things I noticed that need attention (so agents avoid surprises)

  - There is no `package.json` in `functions/` — dependencies (e.g., `@google-cloud/vertexai`, `firebase-functions`) are not declared in the repo. Before installing or deploying functions, add a `functions/package.json` with required deps.
  - `web/src/App.js` currently POSTS to an absolute Cloud Functions URL. For local dev and hosted deployments, use the relative path `/api/parseWorkflow` to leverage the Firebase Hosting rewrite.

- Quick examples for edits

  - To change the prompt: edit `functions/ai/prompts.js` and update `workflowPrompt()`; run or unit-test the function locally.
  - To render Mermaid client-side more robustly: after updating `web/src/App.js`, call `mermaid.init()` or `mermaid.contentLoaded()` after the mermaid text is injected (current code uses a `setTimeout` hack).

- When opening a PR
  - Include test steps: how to run the frontend (`cd web && npm start`) and how to exercise the function (use `firebase emulators:start` or call the deployed `/api/parseWorkflow`).
  - If changing the Vertex AI call, note required credentials and any billing/quotas impact in the PR description.

If anything above is unclear or you'd like me to expand a section (for example, generate a `functions/package.json` template or switch `web` to use the relative `/api` path), tell me which part to update and I'll iterate.
