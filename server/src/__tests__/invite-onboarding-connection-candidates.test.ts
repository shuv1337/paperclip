import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { buildOnboardingConnectionCandidates } from "../routes/access.js";

function interfaceInfo(
  address: string,
  family: "IPv4" | "IPv6",
): NetworkInterfaceInfo {
  return {
    address,
    family,
    internal: false,
    netmask: family === "IPv4" ? "255.255.255.255" : "ffff:ffff:ffff:ffff::",
    cidr: null,
    mac: "00:00:00:00:00:00",
    ...(family === "IPv6" ? { scopeid: 1 } : {}),
  };
}

describe("buildOnboardingConnectionCandidates", () => {
  it("keeps an https MagicDNS public origin and uses the http listen port for other hosts", () => {
    expect(
      buildOnboardingConnectionCandidates({
        apiBaseUrl: "https://magicdns.example.ts.net",
        bindHost: "0.0.0.0",
        allowedHostnames: ["magicdns.example.ts.net", "MagicDNS", "magicdns"],
        listenPort: 8000,
        listenScheme: "http",
        networkInterfacesMap: {
          tailscale0: [
            interfaceInfo("100.64.1.2", "IPv4"),
            interfaceInfo("fe80::1", "IPv6"),
          ],
        },
      }),
    ).toEqual([
      "https://magicdns.example.ts.net",
      "http://100.64.1.2:8000",
      "http://magicdns.example.ts.net:8000",
      "http://magicdns:8000",
    ]);
  });

  it("adds host.docker.internal with the listen port when the base URL is loopback", () => {
    expect(
      buildOnboardingConnectionCandidates({
        apiBaseUrl: "http://127.0.0.1:3100",
        bindHost: "127.0.0.1",
        allowedHostnames: [],
        listenPort: 8000,
        listenScheme: "http",
        networkInterfacesMap: {},
      }),
    ).toEqual([
      "http://127.0.0.1:3100",
      "http://host.docker.internal:8000",
    ]);

    expect(
      buildOnboardingConnectionCandidates({
        apiBaseUrl: "http://localhost:8000",
        bindHost: "127.0.0.1",
        allowedHostnames: [],
        listenPort: 8000,
        listenScheme: "http",
        networkInterfacesMap: {},
      }),
    ).toEqual([
      "http://localhost:8000",
      "http://host.docker.internal:8000",
    ]);
  });

  it("includes a non-default listen port and omits the scheme default", () => {
    expect(
      buildOnboardingConnectionCandidates({
        apiBaseUrl: "https://board.example.test",
        bindHost: "board.example.test",
        allowedHostnames: [],
        listenPort: 443,
        listenScheme: "https",
        networkInterfacesMap: {},
      }),
    ).toEqual(["https://board.example.test"]);

    expect(
      buildOnboardingConnectionCandidates({
        apiBaseUrl: "https://board.example.test",
        bindHost: "board.example.test",
        allowedHostnames: ["board.example.test"],
        listenPort: 8443,
        listenScheme: "https",
        networkInterfacesMap: {},
      }),
    ).toEqual([
      "https://board.example.test",
      "https://board.example.test:8443",
    ]);
  });
});
