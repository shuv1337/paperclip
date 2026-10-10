import { describe, expect, it } from "vitest";
import { findOtherActiveCeo } from "./agent-role";

const agents = [
  { id: "ceo-paused", name: "Ada", role: "ceo", status: "paused" },
  { id: "ceo-gone", name: "Old", role: "ceo", status: "terminated" },
  { id: "eng", name: "Bea", role: "engineer", status: "idle" },
];

describe("findOtherActiveCeo", () => {
  it("returns another non-terminated CEO", () => {
    expect(findOtherActiveCeo(agents, "eng")?.id).toBe("ceo-paused");
  });

  it("ignores the agent being edited and terminated CEOs", () => {
    expect(findOtherActiveCeo(agents, "ceo-paused")).toBeNull();
    expect(
      findOtherActiveCeo(
        [{ id: "gone", name: "Old", role: "ceo", status: "terminated" }],
        "eng",
      ),
    ).toBeNull();
  });
});
