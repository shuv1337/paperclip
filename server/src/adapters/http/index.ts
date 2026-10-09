import type { ServerAdapterModule } from "../types.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export const httpAdapter: ServerAdapterModule = {
  type: "http",
  runtimeToolDelivery: "invocation_context",
  execute,
  testEnvironment,
  models: [],
  agentConfigurationDoc: `# http agent configuration

Adapter: http

Core fields:
- url (string, required): endpoint to invoke
- method (string, optional): HTTP method, default POST
- headers (object, optional): request headers
- payloadTemplate (object, optional): JSON payload template
- timeoutSec (number, optional): request timeout in seconds. In async mode this is also the deadline for the completion callback. 0 waits until completion or cancellation.
- responseMode (string, optional): \`auto\` (default), \`async\`, or \`sync\`
  - \`auto\`: HTTP 202 or a JSON body \`{"async":true}\` keeps the run running. Any other 2xx closes it.
  - \`async\`: any 2xx keeps the run running until the completion callback or timeout.
  - \`sync\`: any 2xx closes the run immediately.
- callbackBaseUrl (string, optional): absolute Paperclip origin used to build the completion URL. Defaults to PAPERCLIP_API_URL.

When the run may stay open, the webhook JSON includes \`paperclipCallback\`:
- runId: heartbeat run id
- url: \`{origin}/api/runs/{runId}/complete\`
- token: run-scoped bearer token (also accepted: the agent API key)
- method: POST
- auth: bearer
- timeoutSec: present when a deadline is configured

Completion body: \`{ "status": "succeeded" | "failed", "summary"?: string }\`.
Send \`Authorization: Bearer <token>\`.
`,
};
