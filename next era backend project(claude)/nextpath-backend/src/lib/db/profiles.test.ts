import { describe, expect, it } from "vitest";

import {
  getFullProfileById,
  getMatchProfileById,
  getProfileById,
  upsertProfile,
  upsertSoftFacts
} from "./profiles";
import { createMockSupabaseClient } from "./testing/mock-supabase-client";

describe("getProfileById", () => {
  it("returns null when no profile row exists yet", async () => {
    const client = createMockSupabaseClient({ data: null, error: null });

    const result = await getProfileById("user-1", client);

    expect(result).toBeNull();
  });

  it("maps a database row to an EligibilityProfile", async () => {
    const client = createMockSupabaseClient({
      data: {
        id: "user-1",
        nationality_code: "EG",
        birth_date: "2004-06-01",
        education_level: "BACHELOR",
        academic_year: 2,
        gpa: 3.5,
        residency_country_code: "EG",
        has_required_legal_authorization: true,
        soft_facts: {}
      },
      error: null
    });

    const result = await getProfileById("user-1", client);

    expect(result).toEqual({
      nationalityCode: "EG",
      birthDate: "2004-06-01",
      educationLevel: "BACHELOR",
      academicYear: 2,
      gpa: 3.5,
      residencyCountryCode: "EG",
      hasRequiredLegalAuthorization: true
    });
  });

  it("throws a descriptive error when Supabase reports one", async () => {
    const client = createMockSupabaseClient({ data: null, error: { message: "connection reset" } });

    await expect(getProfileById("user-1", client)).rejects.toThrow(/connection reset/);
  });

  it("queries the profiles table filtered by id", async () => {
    const client = createMockSupabaseClient({ data: null, error: null });

    await getProfileById("user-42", client);

    expect(client.__calls).toContainEqual({ method: "from", args: ["profiles"] });
    expect(client.__calls).toContainEqual({ method: "eq", args: ["id", "user-42"] });
  });
});

describe("upsertProfile", () => {
  it("writes snake_case columns mapped from the camelCase profile, defaulting missing fields to null", async () => {
    const client = createMockSupabaseClient({ data: null, error: null });

    await upsertProfile("user-1", { nationalityCode: "EG", gpa: 3.5 }, client);

    const upsertCall = client.__calls.find((call) => call.method === "upsert");
    expect(upsertCall?.args[0]).toEqual({
      id: "user-1",
      nationality_code: "EG",
      birth_date: null,
      education_level: null,
      academic_year: null,
      gpa: 3.5,
      residency_country_code: null,
      has_required_legal_authorization: null
    });
  });

  it("throws a descriptive error when the write fails", async () => {
    const client = createMockSupabaseClient({ data: null, error: { message: "constraint violation" } });

    await expect(upsertProfile("user-1", {}, client)).rejects.toThrow(/constraint violation/);
  });
});

describe("getMatchProfileById / getFullProfileById", () => {
  it("returns the soft_facts JSONB column as the MatchProfile", async () => {
    const client = createMockSupabaseClient({
      data: {
        id: "user-1",
        nationality_code: null,
        birth_date: null,
        education_level: null,
        academic_year: null,
        gpa: null,
        residency_country_code: null,
        has_required_legal_authorization: null,
        soft_facts: { major: ["CS"], skills: ["Python"] }
      },
      error: null
    });

    const result = await getMatchProfileById("user-1", client);

    expect(result).toEqual({ major: ["CS"], skills: ["Python"] });
  });

  it("returns the eligibility and match halves together from getFullProfileById", async () => {
    const client = createMockSupabaseClient({
      data: {
        id: "user-1",
        nationality_code: "EG",
        birth_date: null,
        education_level: "BACHELOR",
        academic_year: null,
        gpa: null,
        residency_country_code: null,
        has_required_legal_authorization: null,
        soft_facts: { skills: ["Python"] }
      },
      error: null
    });

    const result = await getFullProfileById("user-1", client);

    expect(result).toEqual({
      eligibility: { nationalityCode: "EG", educationLevel: "BACHELOR" },
      match: { skills: ["Python"] }
    });
  });
});

describe("upsertSoftFacts", () => {
  it("writes the soft_facts column with the supplied MatchProfile", async () => {
    const client = createMockSupabaseClient({ data: null, error: null });

    await upsertSoftFacts("user-1", { major: ["CS"], skills: ["Python"] }, client);

    const upsertCall = client.__calls.find((call) => call.method === "upsert");
    expect(upsertCall?.args[0]).toEqual({
      id: "user-1",
      soft_facts: { major: ["CS"], skills: ["Python"] }
    });
  });
});
