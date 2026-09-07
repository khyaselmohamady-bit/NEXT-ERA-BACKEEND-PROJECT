import { describe, expect, it } from "vitest";

import {
  describeVerification,
  isHighConfidence,
  isVerified,
  needsReview,
  type Verification
} from "./verification";

const verifiedRow: Verification = {
  source: "Official website",
  lastVerifiedAt: "2026-09-01",
  status: "VERIFIED",
  confidence: "HIGH"
};

const reviewNeededRow: Verification = {
  source: null,
  lastVerifiedAt: null,
  status: "REVIEW_NEEDED",
  confidence: null
};

const unverifiedRow: Verification = {
  source: null,
  lastVerifiedAt: null,
  status: null,
  confidence: null
};

describe("verification helpers", () => {
  it("isVerified returns true only for explicit VERIFIED status", () => {
    expect(isVerified(verifiedRow)).toBe(true);
    expect(isVerified(reviewNeededRow)).toBe(false);
    expect(isVerified(unverifiedRow)).toBe(false);
  });

  it("isHighConfidence returns true only for explicit HIGH confidence", () => {
    expect(isHighConfidence(verifiedRow)).toBe(true);
    expect(isHighConfidence(reviewNeededRow)).toBe(false);
    expect(isHighConfidence(unverifiedRow)).toBe(false);
  });

  it("needsReview returns true for REVIEW_NEEDED and for missing status", () => {
    expect(needsReview(verifiedRow)).toBe(false);
    expect(needsReview(reviewNeededRow)).toBe(true);
    // An unverified row has no curator sign-off yet, so it counts as needing review.
    expect(needsReview(unverifiedRow)).toBe(true);
  });

  it("describeVerification produces the §12 user-visible strings", () => {
    expect(describeVerification(verifiedRow)).toBe(
      "Verified from Official website on 2026-09-01."
    );
    expect(describeVerification(reviewNeededRow)).toBe(
      "Verification needed — data may be incomplete or out of date."
    );
    expect(describeVerification(unverifiedRow)).toBe("Not yet verified.");
  });

  it("describeVerification handles verified rows without a source label", () => {
    const noSource: Verification = {
      source: null,
      lastVerifiedAt: "2026-09-01",
      status: "VERIFIED",
      confidence: "HIGH"
    };
    expect(describeVerification(noSource)).toBe("Verified on 2026-09-01.");
  });
});
// End of section: every helper is pinned by at least one test so the
// blueprint's §12 wording stays stable across changes.