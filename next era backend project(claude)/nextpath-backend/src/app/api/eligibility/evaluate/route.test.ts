import { describe, expect, it } from "vitest";

import { POST } from "./route";

// End of section: Route Handlers speak the standard Web Request/Response API, so they can be
// exercised directly in Node without booting the Next.js dev server.

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/eligibility/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

const validBody = {
  profile: {
    nationalityCode: "EG",
    birthDate: "2004-06-01",
    educationLevel: "BACHELOR",
    academicYear: 2,
    gpa: 3.5,
    residencyCountryCode: "EG",
    hasRequiredLegalAuthorization: true
  },
  requirements: {
    nationality: { sourceStatus: "EXPLICIT", value: ["EG"] },
    age: { sourceStatus: "EXPLICIT", value: { minimum: 18, maximum: 30 } },
    educationLevel: { sourceStatus: "EXPLICIT", value: ["BACHELOR"] },
    academicYear: { sourceStatus: "EXPLICIT", value: [2, 3, 4] },
    minimumGpa: { sourceStatus: "EXPLICIT", value: 3.2 },
    residency: { sourceStatus: "EXPLICIT", value: ["EG"] },
    requiresLegalAuthorization: { sourceStatus: "EXPLICIT", value: true },
    deadline: { sourceStatus: "EXPLICIT", value: "2026-12-01" }
  },
  asOf: "2026-09-06"
};

describe("POST /api/eligibility/evaluate", () => {
  it("returns a 200 with the engine's verdict for a valid request", async () => {
    const response = await POST(jsonRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.verdict).toBe("ELIGIBLE");
    expect(data.failedRequirements).toEqual([]);
  });

  it("returns a 400 with issue details when the request shape is invalid", async () => {
    const response = await POST(jsonRequest({ profile: {}, requirements: {} }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("invalid_request_shape");
    expect(Array.isArray(data.issues)).toBe(true);
  });

  it("returns a 400 when the body isn't valid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/eligibility/evaluate", {
        method: "POST",
        body: "{not json"
      })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_json_body");
  });
});
// End of section: covers a full valid round-trip, a validation failure, and a malformed-JSON request.
