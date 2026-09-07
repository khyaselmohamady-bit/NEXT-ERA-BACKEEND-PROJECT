import { describe, expect, it } from "vitest";

import {
  canTransition,
  DEFAULT_INITIAL_STATE,
  isTerminal,
  TRANSITIONS,
  validNextStates
} from "./stateMachine";

describe("state machine transitions", () => {
  it("allows the §37 forward path", () => {
    expect(canTransition("DISCOVERED", "SAVED")).toBe(true);
    expect(canTransition("SAVED", "PREPARING")).toBe(true);
    expect(canTransition("PREPARING", "READY")).toBe(true);
    expect(canTransition("READY", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "ACCEPTED")).toBe(true);
    expect(canTransition("SUBMITTED", "REJECTED")).toBe(true);
  });

  it("allows backtracking to earlier states", () => {
    expect(canTransition("SAVED", "DISCOVERED")).toBe(true);
    expect(canTransition("PREPARING", "SAVED")).toBe(true);
    expect(canTransition("READY", "PREPARING")).toBe(true);
  });

  it("forbids skipping states", () => {
    expect(canTransition("DISCOVERED", "PREPARING")).toBe(false);
    expect(canTransition("DISCOVERED", "READY")).toBe(false);
    expect(canTransition("DISCOVERED", "SUBMITTED")).toBe(false);
    expect(canTransition("SAVED", "READY")).toBe(false);
    expect(canTransition("SAVED", "SUBMITTED")).toBe(false);
    expect(canTransition("PREPARING", "SUBMITTED")).toBe(false);
    expect(canTransition("READY", "ACCEPTED")).toBe(false);
    expect(canTransition("READY", "REJECTED")).toBe(false);
  });

  it("treats ACCEPTED, REJECTED, EXPIRED as terminal", () => {
    expect(isTerminal("ACCEPTED")).toBe(true);
    expect(isTerminal("REJECTED")).toBe(true);
    expect(isTerminal("EXPIRED")).toBe(true);
    expect(validNextStates("ACCEPTED")).toEqual([]);
    expect(validNextStates("REJECTED")).toEqual([]);
    expect(validNextStates("EXPIRED")).toEqual([]);
    // No transition out of a terminal state.
    expect(canTransition("ACCEPTED", "SAVED")).toBe(false);
    expect(canTransition("ACCEPTED", "READY")).toBe(false);
    expect(canTransition("REJECTED", "SAVED")).toBe(false);
    expect(canTransition("EXPIRED", "SAVED")).toBe(false);
  });

  it("forbids self-transitions (no-op moves are not transitions)", () => {
    for (const state of Object.keys(TRANSITIONS) as Array<
      keyof typeof TRANSITIONS
    >) {
      expect(canTransition(state, state)).toBe(false);
    }
  });

  it("every state is in the transition table", () => {
    const keys = Object.keys(TRANSITIONS);
    expect(keys).toHaveLength(8);
    expect(keys.sort()).toEqual(
      [
        "ACCEPTED",
        "DISCOVERED",
        "EXPIRED",
        "PREPARING",
        "READY",
        "REJECTED",
        "SAVED",
        "SUBMITTED"
      ].sort()
    );
  });

  it("default initial state is SAVED, matching the demo's 'save' button", () => {
    expect(DEFAULT_INITIAL_STATE).toBe("SAVED");
  });
});
// End of section: every §37 transition is pinned, every skip is
// rejected, and the terminal-state discipline is enforced.