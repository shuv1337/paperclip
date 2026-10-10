import type { ServerAdapterModule } from "../types.js";
import { getConfigSchema } from "./config-schema.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export const httpAdapter: ServerAdapterModule = {
  type: "http",
  runtimeToolDelivery: "invocation_context",
  execute,
  testEnvironment,
  models: [],
  getConfigSchema,
  agentConfigurationDoc: `# http agent configuration

Adapter: http

Use when:
- The agent runs outside Paperclip and should be invoked with an HTTP request
- You need to call a webhook, function, or internal service with the run context

Don't use when:
- The agent must run a local CLI harness (use claude_local, codex_local, or another local adapter)
- You only need to spawn a process on the Paperclip host (use process)

Core fields:
- url (string, required): absolute http(s) endpoint to invoke
- method (string, optional): HTTP method, default POST
- headers (object, optional): request headers. Each value is a string or a secret reference \`{ type: "secret_ref", secretId, version }\`. A \`user_secret_ref\` is also accepted. Secret references are resolved before the request is sent.
- payloadTemplate (object, optional): JSON payload template merged into the request body
- timeoutSec (number, optional): request timeout in seconds. 0 means no timeout. Legacy timeoutMs is honored only when timeoutSec is omitted.
`,
};
