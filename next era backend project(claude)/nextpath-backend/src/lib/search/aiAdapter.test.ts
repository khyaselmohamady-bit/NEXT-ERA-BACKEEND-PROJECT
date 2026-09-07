import { describe, expect, it } from "vitest";

import { noOpAdapter, selectAiAdapter } from "./aiAdapter";

describe("noOpAdapter", () => {
  it("always returns the disabled variant regardless of the query", async () => {
    const result = await noOpAdapter.parseQuery("AI scholarships in Egypt");
    expect(result.status).toBe("disabled");
    if (result.status !== "disabled") {
      throw new Error("expected disabled");
    }
    expect(result.message).toContain("filters:");
  });

  it("returns the disabled variant for an empty query too", async () => {
    const result = await noOpAdapter.parseQuery("");
    expect(result.status).toBe("disabled");
  });
});

describe("selectAiAdapter", () => {
  it("returns the no-op adapter when AI_PROVIDER_API_KEY is unset", () => {
    const previousKey = process.env["AI_PROVIDER_API_KEY"];
    delete process.env["AI_PROVIDER_API_KEY"];

    const adapter = selectAiAdapter();

    expect(adapter).toBe(noOpAdapter);

    if (previousKey !== undefined) {
      process.env["AI_PROVIDER_API_KEY"] = previousKey;
    }
  });

  it("returns the no-op adapter even when AI_PROVIDER_API_KEY is set (real adapter is not yet implemented)", () => {
    // §65 MVP deliberately keeps the no-op path active even when a key
    // is configured. Wiring a real provider is a future increment that
    // will add an `openRouterAdapter` and update `selectAiAdapter` to
    // return it. Until then, the AI path is safe-by-default.
    const previousKey = process.env["AI_PROVIDER_API_KEY"];
    process.env["AI_PROVIDER_API_KEY"] = "fake-key-for-test";

    const adapter = selectAiAdapter();

    expect(adapter).toBe(noOpAdapter);

    if (previousKey === undefined) {
      delete process.env["AI_PROVIDER_API_KEY"];
    } else {
      process.env["AI_PROVIDER_API_KEY"] = previousKey;
    }
  });
});
// End of section: the no-op adapter is the safe default for both
// unset and set env vars. The future increment that wires a real
// provider can add a third test here proving the openRouterAdapter
// is selected when the key is present and the implementation exists.