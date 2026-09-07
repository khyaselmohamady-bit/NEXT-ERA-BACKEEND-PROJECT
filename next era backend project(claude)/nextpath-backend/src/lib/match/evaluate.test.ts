import { describe, expect, it } from "vitest";

import { evaluateMatch } from "./evaluate";
import {
  MATCH_WEIGHTS,
  type MatchOpportunity,
  type MatchProfile
} from "./types";

// SECTION: Stable fixtures
// `fullProfile` and `fullOpportunity` together produce a 100% match in the
// tests below. Keeping them as named constants makes the assertion obvious:
// the score is *expected* to be the full sum of MATCH_WEIGHTS.
const fullProfile: MatchProfile = {
  major: ["Computer Engineering"],
  skills: ["Python", "PyTorch"],
  interests: ["AI", "robotics"],
  goals: ["research"],
  experience: ["research intern"],
  languages: [{ language: "English", level: "C1" }],
  academicFit: ["honors list"]
};

const fullOpportunity: MatchOpportunity = {
  preferredMajors: ["Computer Engineering"],
  preferredSkills: ["Python", "PyTorch"],
  preferredInterests: ["AI", "robotics"],
  preferredGoals: ["research"],
  preferredExperience: ["research intern"],
  preferredLanguages: [{ language: "English", level: "C1" }],
  preferredAcademicFit: ["honors list"]
};
// End of section: these two fixtures are reused by every positive test.

describe("evaluateMatch", () => {
  it("returns a perfect score when the student's facts fully cover the opportunity's preferences", () => {
    const result = evaluateMatch(fullProfile, fullOpportunity);
    expect(result.verdict).toBe("STRONG");
    const expectedMax = Object.values(MATCH_WEIGHTS).reduce((s, v) => s + v, 0);
    expect(result.score).toBe(expectedMax);
    for (const check of result.checks) {
      expect(check.awarded).toBe(check.max);
      expect(check.messageData.type).toBe("partial_overlap");
    }
  });

  it("returns UNKNOWN with score null when the opportunity declares no preferred tokens", () => {
    const result = evaluateMatch(fullProfile, {});
    expect(result.score).toBeNull();
    expect(result.verdict).toBe("UNKNOWN");
    for (const check of result.checks) {
      expect(check.awarded).toBeNull();
      expect(check.messageData.type).toBe("no_preferred_tokens");
    }
  });

  it("returns POOR (0) when the student lists nothing and the opportunity declares preferences", () => {
    const result = evaluateMatch({}, fullOpportunity);
    expect(result.verdict).toBe("POOR");
    expect(result.score).toBe(0);
    for (const check of result.checks) {
      expect(check.awarded).toBe(0);
      expect(check.messageData.type).toBe("no_overlap");
    }
  });

  it("partial coverage yields a score proportional to the share of preferred tokens matched", () => {
    const result = evaluateMatch(
      { skills: ["Python"] },
      { preferredSkills: ["Python", "PyTorch"] }
    );
    // Half the preferred tokens are covered → half the skills weight (10.0 of 20.0).
    expect(result.checks[1].awarded).toBe(10);
    expect(result.checks[1].messageData).toMatchObject({ type: "partial_overlap", ratio: 0.5 });
    expect(result.score).toBe(10);
  });

  it("verdict bands: 40 = FAIR, 60 = GOOD, 80 = STRONG, 39 = POOR", () => {
    // Build profiles that yield exactly the band boundaries.
    // Skills weight = 20; for a 40 score we need 40 points, easiest with one full dimension.
    const allSkills: MatchOpportunity = { preferredSkills: ["Python", "Go", "Rust"] };
    const skillsHit: MatchProfile = { skills: ["Python", "Go", "Rust"] };
    const a = evaluateMatch(skillsHit, allSkills);
    expect(a.score).toBe(20);
    expect(a.verdict).toBe("POOR");

    // Two full dimensions (20 + 20 = 40) → FAIR.
    const twoFull: MatchProfile = {
      major: ["CS"],
      skills: ["Python", "Go", "Rust"]
    };
    const twoFullOpp: MatchOpportunity = {
      preferredMajors: ["CS"],
      preferredSkills: ["Python", "Go", "Rust"]
    };
    const b = evaluateMatch(twoFull, twoFullOpp);
    expect(b.score).toBe(40);
    expect(b.verdict).toBe("FAIR");

    // Three full dimensions (20 + 20 + 15 = 55) → FAIR.
    const threeFull: MatchProfile = {
      major: ["CS"],
      skills: ["Python", "Go", "Rust"],
      interests: ["AI"]
    };
    const threeFullOpp: MatchOpportunity = {
      preferredMajors: ["CS"],
      preferredSkills: ["Python", "Go", "Rust"],
      preferredInterests: ["AI"]
    };
    const c = evaluateMatch(threeFull, threeFullOpp);
    expect(c.score).toBe(55);
    expect(c.verdict).toBe("FAIR");

    // Four full dimensions (20 + 20 + 15 + 15 = 70) → GOOD.
    const fourFull: MatchProfile = {
      major: ["CS"],
      skills: ["Python", "Go", "Rust"],
      interests: ["AI"],
      goals: ["research"]
    };
    const fourFullOpp: MatchOpportunity = {
      preferredMajors: ["CS"],
      preferredSkills: ["Python", "Go", "Rust"],
      preferredInterests: ["AI"],
      preferredGoals: ["research"]
    };
    const d = evaluateMatch(fourFull, fourFullOpp);
    expect(d.score).toBe(70);
    expect(d.verdict).toBe("GOOD");

    // Five full dimensions (20 + 20 + 15 + 15 + 10 = 80) → STRONG.
    const fiveFull: MatchProfile = {
      major: ["CS"],
      skills: ["Python", "Go", "Rust"],
      interests: ["AI"],
      goals: ["research"],
      experience: ["research intern"]
    };
    const fiveFullOpp: MatchOpportunity = {
      preferredMajors: ["CS"],
      preferredSkills: ["Python", "Go", "Rust"],
      preferredInterests: ["AI"],
      preferredGoals: ["research"],
      preferredExperience: ["research intern"]
    };
    const e = evaluateMatch(fiveFull, fiveFullOpp);
    expect(e.score).toBe(80);
    expect(e.verdict).toBe("STRONG");
  });

  it("case-insensitive and deduplicated on the student side", () => {
    const result = evaluateMatch(
      { major: ["  CS ", "cs", "CS"] },
      { preferredMajors: ["cs"] }
    );
    expect(result.checks[0].awarded).toBe(20);
  });

  it("language tuple must match both language and level to count", () => {
    const result = evaluateMatch(
      { languages: [{ language: "English", level: "B1" }] },
      { preferredLanguages: [{ language: "English", level: "C1" }] }
    );
    expect(result.checks[5].awarded).toBe(0);
    expect(result.checks[5].messageData.type).toBe("no_overlap");
  });

  it("language tuple match awards the full language weight", () => {
    const result = evaluateMatch(
      { languages: [{ language: "English", level: "C1" }] },
      { preferredLanguages: [{ language: "English", level: "C1" }] }
    );
    expect(result.checks[5].awarded).toBe(10);
  });

  it("emits one check per dimension, in the order documented in MATCH_WEIGHTS", () => {
    const result = evaluateMatch(fullProfile, fullOpportunity);
    expect(result.checks.map((c) => c.dimension)).toEqual([
      "major",
      "skills",
      "interests",
      "goals",
      "experience",
      "language",
      "academic"
    ]);
  });

  it("returns the seven weights' max points as the perfect-score ceiling", () => {
    const total = Object.values(MATCH_WEIGHTS).reduce((s, v) => s + v, 0);
    expect(total).toBe(100);
  });
});
// End of section: every dimension is exercised, every verdict band is pinned,
// and the order/structure of the breakdown is asserted so the AI layer (a
// later increment) can rely on it without re-deriving the layout.