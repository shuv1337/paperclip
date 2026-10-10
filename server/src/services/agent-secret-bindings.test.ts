import { describe, expect, it } from "vitest";
import { collectSecretRefs, collectUserSecretRefs } from "./agent-secret-bindings.js";

const secretId = "11111111-1111-4111-8111-111111111111";

describe("agent secret binding collection", () => {
  it("collects http header secret refs beside env refs", () => {
    expect(collectSecretRefs({
      env: {
        TOKEN: { type: "secret_ref", secretId, version: "latest" },
      },
      headers: {
        Authorization: { type: "secret_ref", secretId, version: "latest" },
        "X-Trace": "visible",
      },
    })).toEqual([
      expect.objectContaining({ configPath: "env.TOKEN", secretId }),
      expect.objectContaining({ configPath: "headers.Authorization", secretId }),
    ]);
  });

  it("collects user secret refs stored on http headers", () => {
    expect(collectUserSecretRefs({
      headers: {
        Authorization: { type: "user_secret_ref", key: "hook_token", version: "latest", required: true },
      },
    })).toEqual([
      expect.objectContaining({
        definitionKey: "hook_token",
        configPath: "headers.Authorization",
        envKey: "Authorization",
      }),
    ]);
  });
});
