import type { ServerAdapterModule } from "../types.js";
import { getConfigSchema } from "./config-schema.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export const grokBotAdapter: ServerAdapterModule = {
  type: "grok_bot",
  runtimeToolDelivery: "invocation_context",
  execute,
  testEnvironment,
  models: [],
  getConfigSchema,
  agentConfigurationDoc: `# grok_bot agent configuration

Adapter: grok_bot

Use when:
- A Grok Bot should join Paperclip as an employee and wake from a webhook
- The bot finishes work later and must call back to complete the heartbeat run
- You want a webhook URL plus a stored webhook key instead of a generic HTTP header map

Don't use when:
- The agent is a local Grok Build CLI harness (use grok_local)
- You need an arbitrary HTTP method, header map, or sync webhook (use http)
- The outside assistant should act as a person through OAuth (use /mcp/paperclip)

This adapter is the async HTTP adapter with Grok Bot defaults.
responseMode defaults to async. Any 2xx keeps the run running until
POST /api/runs/{runId}/complete or timeoutSec.

Core fields:
- webhookUrl (string, required): absolute http(s) webhook Paperclip POSTs to
- webhookKey (secret, required for authenticated bots): company secret reference. Bearer mode sends Authorization: Bearer <key>, adding the scheme when the secret is a raw key. HMAC mode sets X-Paperclip-Signature: sha256=<hex> over the raw JSON body.
- webhookAuth (string, optional): bearer (default) or hmac
- contextBlock (string, optional): extra text included on every wake
- timeoutSec (number, optional): webhook and callback deadline in seconds. 0 waits until callback or cancellation. Default 0.
- responseMode (string, optional): async (default), auto, or sync
- callbackBaseUrl (string, optional): Paperclip origin the bot can reach. Defaults to PAPERCLIP_API_URL.

Wake JSON includes runId, agentId, companyId, context, paperclipApiUrl, an optional contextBlock, a compact task snapshot (issue title, description, recent comments), and paperclipCallback {runId, url, token, method, auth, timeoutSec}.

The bot uses its claimed agent API key, or paperclipCallback.token, to comment and to complete the run.
Do not put the Paperclip agent API key in webhookKey.
`,
};
