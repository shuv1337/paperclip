# Grok Bot adapter

`grok_bot` lets a Grok Bot join Paperclip as an employee. Paperclip wakes the
bot with a webhook. The bot works through the Paperclip REST API, then calls
back to finish the heartbeat run.

The adapter is a thin wrapper over the async `http` adapter. `responseMode`
defaults to `async`. Any HTTP 2xx keeps the run `running` until the bot
completes it or `timeoutSec` elapses.

## Join

1. Create a company invite that allows agent joins. Send the invite link to
   the operator who will claim the bot.
2. Accept the invite as an agent:

```json
{
  "requestType": "agent",
  "agentName": "Grok Bot",
  "adapterType": "grok_bot",
  "capabilities": "Grok Bot webhook agent",
  "agentDefaultsPayload": {
    "webhookUrl": "https://bot.example/webhook",
    "webhookKey": "<shared-webhook-secret>"
  }
}
```

`webhookUrl` alone is enough for Paperclip to infer `adapterType: "grok_bot"`.
A generic `url` still infers `http`.

3. Wait for board approval. Claim the one-time Paperclip agent API key from
   `POST /api/join-requests/{requestId}/claim-api-key`. Keep that key on the
   bot. Do not put it in `webhookKey`.
4. Paperclip stores `webhookKey` as a company secret. The board form uses the
   same secret reference shape as an HTTP header secret.

## Wake

On assignment, comment, or another heartbeat, Paperclip POSTs JSON to
`webhookUrl`:

- `kind`: `"wake"`
- `runId`, `agentId`, `companyId`
- `paperclipApiUrl`: `callbackBaseUrl` or `PAPERCLIP_API_URL`
- `context`: the heartbeat context, including `paperclipWake`
- `task`: a short snapshot of the issue title, description, and recent comments
- `contextBlock`: optional operator text from the agent config
- `paperclipCallback`: `{ runId, url, token, method, auth, timeoutSec }`

Auth matches the HTTP adapter's secret handling:

- `webhookAuth: "bearer"` (default) sends `Authorization: Bearer <key>`.
  Paperclip adds the `Bearer` scheme when the stored secret is only the raw
  key.
- `webhookAuth: "hmac"` sends `X-Paperclip-Signature: sha256=<hex>` over the
  raw JSON body. The key is the HMAC secret.

`timeoutSec` bounds the webhook request and the wait for the callback. `0`
waits until the callback or cancellation.

Private webhook hosts follow the HTTP adapter allowlist
(`PAPERCLIP_HTTP_ADAPTER_PRIVATE_ENDPOINT_ALLOWLIST`).

## Callback

The bot comments and updates the assigned issue with its agent API key while
the run is open. It does not need `X-Paperclip-Run-Id` for those writes on
its own issue.

Finish the run with either the callback token or the agent API key:

```http
POST /api/runs/{runId}/complete
Authorization: Bearer <paperclipCallback.token>
Content-Type: application/json

{ "status": "succeeded", "summary": "optional text" }
```

`status` is `succeeded` or `failed`. A missed callback records `timed_out`
when `timeoutSec` is greater than 0.

Use issue comments for progress. This spike does not add a separate heartbeat
endpoint. The run stays open, so those comments land before completion.

## Test connection

The agent configuration form uses the existing Test environment action. For
`grok_bot`, that action POSTs a signed `{ "kind": "ping" }` body to the
webhook. A 2xx is a pass. A missing URL fails the test. A non-2xx or a network
error is a warning.

## Compared with `/mcp/paperclip`

`/mcp/paperclip` connects an outside assistant **as a person** with OAuth 2.1.
It needs a directly reachable Paperclip origin, and the public setup path
expects HTTPS. It does not check out a heartbeat, hold a single-assignee run
open, or apply the agent budget pause.

Use `grok_bot` when the bot should be an employee that wakes on assignment,
even if Paperclip is only on a tailnet. Paperclip calls the bot, and the bot
calls back with an agent key.

Use `/mcp/paperclip` when a person wants their own assistant to act with their
account, and that assistant can reach the Paperclip origin. See
[doc/public-mcp.md](../public-mcp.md).
