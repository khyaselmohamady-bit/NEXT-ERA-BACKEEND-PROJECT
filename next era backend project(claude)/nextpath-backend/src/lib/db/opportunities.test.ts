import { describe, expect, it } from "vitest";

import { createOpportunity, getOpportunityById, listOpportunities } from "./opportunities";
import { createMockSupabaseClient } from "./testing/mock-supabase-client";
import type { OpportunityHardRequirements } from "@/lib/eligibility/types";

const sampleRequirements: OpportunityHardRequirements = {
  nationality: { sourceStatus: "EXPLICIT", value: ["EG"] },
  age: { sourceStatus: "EXPLICIT", value: { minimum: 18, maximum: 30 } },
  educationLevel: { sourceStatus: "EXPLICIT", value: ["BACHELOR"] },
  academicYear: { sourceStatus: "EXPLICIT", value: [2, 3, 4] },
  minimumGpa: { sourceStatus: "EXPLICIT", value: 3.2 },
  residency: { sourceStatus: "EXPLICIT", value: ["EG"] },
  requiresLegalAuthorization: { sourceStatus: "EXPLICIT", value: true },
  deadline: { sourceStatus: "EXPLICIT", value: "2026-12-01" }
};

const sampleRow = {
  id: "opp-1",
  title: "STEM Excellence Scholarship",
  organization: "NextPath Foundation",
  source_url: "https://example.org/stem-excellence",
  hard_requirements: sampleRequirements,
  source: "Official website",
  last_verified_at: "2026-09-01T12:00:00Z",
  verification_status: "VERIFIED" as const,
  confidence: "HIGH" as const
};

describe("getOpportunityById", () => {
  it("returns null when the opportunity doesn't exist", async () => {
    const client = createMockSupabaseClient({ data: null, error: null });

    const result = await getOpportunityById("missing-id", client);

    expect(result).toBeNull();
  });

  it("maps a database row to an Opportunity, passing hard_requirements through unchanged", async () => {
    const client = createMockSupabaseClient({ data: sampleRow, error: null });

    const result = await getOpportunityById("opp-1", client);

    expect(result).toEqual({
      id: "opp-1",
      title: "STEM Excellence Scholarship",
      organization: "NextPath Foundation",
      sourceUrl: "https://example.org/stem-excellence",
      hardRequirements: sampleRequirements,
      verification: {
        source: "Official website",
        lastVerifiedAt: "2026-09-01T12:00:00Z",
        status: "VERIFIED",
        confidence: "HIGH"
      }
    });
  });
});

describe("listOpportunities", () => {
  it("maps every row and defaults to an empty array when there are none", async () => {
    const empty = createMockSupabaseClient({ data: null, error: null });
    expect(await listOpportunities(empty)).toEqual([]);

    const client = createMockSupabaseClient({ data: [sampleRow, { ...sampleRow, id: "opp-2" }], error: null });
    const result = await listOpportunities(client);

    expect(result).toHaveLength(2);
    expect(result[1]?.id).toBe("opp-2");
  });

  it("orders by created_at descending", async () => {
    const client = createMockSupabaseClient({ data: [], error: null });

    await listOpportunities(client);

    expect(client.__calls).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }]
    });
  });
});

describe("createOpportunity", () => {
  it("inserts snake_case columns and returns the mapped row Supabase sends back", async () => {
    const client = createMockSupabaseClient({ data: sampleRow, error: null });

    const result = await createOpportunity(
      {
        title: "STEM Excellence Scholarship",
        organization: "NextPath Foundation",
        sourceUrl: "https://example.org/stem-excellence",
        hardRequirements: sampleRequirements
      },
      client
    );

    const insertCall = client.__calls.find((call) => call.method === "insert");
    expect(insertCall?.args[0]).toEqual({
      title: "STEM Excellence Scholarship",
      organization: "NextPath Foundation",
      source_url: "https://example.org/stem-excellence",
      hard_requirements: sampleRequirements
    });
    expect(result.id).toBe("opp-1");
  });

  it("throws a descriptive error when the insert fails", async () => {
    const client = createMockSupabaseClient({ data: null, error: { message: "permission denied" } });

    await expect(
      createOpportunity({ title: "X", hardRequirements: sampleRequirements }, client)
    ).rejects.toThrow(/permission denied/);
  });
});

describe("verification columns on opportunities", () => {
  it("maps REVIEW_NEEDED rows into a Verification with null source and lastVerifiedAt", async () => {
    const client = createMockSupabaseClient({
      data: {
        ...sampleRow,
        source: null,
        last_verified_at: null,
        verification_status: "REVIEW_NEEDED",
        confidence: null
      },
      error: null
    });

    const result = await getOpportunityById("opp-1", client);

    expect(result?.verification).toEqual({
      source: null,
      lastVerifiedAt: null,
      status: "REVIEW_NEEDED",
      confidence: null
    });
  });

  it("maps MEDIUM confidence distinctly from HIGH", async () => {
    const client = createMockSupabaseClient({
      data: { ...sampleRow, confidence: "MEDIUM" },
      error: null
    });

    const result = await getOpportunityById("opp-1", client);

    expect(result?.verification.confidence).toBe("MEDIUM");
  });
});
