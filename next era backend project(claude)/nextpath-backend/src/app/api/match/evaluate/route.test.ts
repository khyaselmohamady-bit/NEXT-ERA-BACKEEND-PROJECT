import { describe, expect, it } from "vitest";

import { POST } from "./route";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/match/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

const fullProfile = {
  major: ["Computer Engineering"],
  skills: ["Python", "PyTorch"],
  interests: ["AI"],
  goals: ["research"],
  experience: ["research intern"],
  languages: [{ language: "English", level: "C1" }],
  academicFit: ["honors list"]
};

const fullOpportunity = {
  preferredMajors: ["Computer Engineering"],
  preferredSkills: ["Python", "PyTorch"],
  preferredInterests: ["AI"],
  preferredGoals: ["research"],
  preferredExperience: ["research intern"],
  preferredLanguages: [{ language: "English", level: "C1" }],
  preferredAcademicFit: ["honors list"]
};

describe("POST /api/match/evaluate", () => {
  it("returns 400 when the body is not valid JSON", async () => {
    const request = new Request("http://localhost/api/match/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json"
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_json");
  });

  it("returns 400 when the body is missing the profile or opportunity", async () => {
    const response = await POST(jsonRequest({ profile: fullProfile }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_match_request");
  });

  it("returns 400 when an unknown field is included (strict schema)", async () => {
    const response = await POST(
      jsonRequest({ profile: fullProfile, opportunity: fullOpportunity, evilField: true })
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when a language tuple is malformed", async () => {
    const response = await POST(
      jsonRequest({
        profile: { languages: [{ language: "English" }] },
        opportunity: { preferredLanguages: [{ language: "English", level: "C1" }] }
      })
    );
    expect(response.status).toBe(400);
  });

  it("returns 200 with a STRONG match when the student fully covers the opportunity's preferences", async () => {
    const response = await POST(
      jsonRequest({ profile: fullProfile, opportunity: fullOpportunity })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.result.verdict).toBe("STRONG");
    expect(body.result.score).toBe(100);
    expect(Array.isArray(body.result.checks)).toBe(true);
    expect(body.result.checks.length).toBe(7);
  });

  it("returns 200 with UNKNOWN when the opportunity has no preferred tokens", async () => {
    const response = await POST(
      jsonRequest({ profile: fullProfile, opportunity: {} })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.score).toBeNull();
    expect(body.result.verdict).toBe("UNKNOWN");
  });

  it("returns 200 with POOR when the student lists nothing", async () => {
    const response = await POST(
      jsonRequest({ profile: {}, opportunity: fullOpportunity })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.score).toBe(0);
    expect(body.result.verdict).toBe("POOR");
  });
});
// End of section: covers all four failure modes (invalid JSON, missing fields,
// unknown field, malformed language tuple) and the three verdict bands the
// route is responsible for surfacing. The engine itself is exhaustively
// tested in src/lib/match/evaluate.test.ts; this file pins the HTTP contract.