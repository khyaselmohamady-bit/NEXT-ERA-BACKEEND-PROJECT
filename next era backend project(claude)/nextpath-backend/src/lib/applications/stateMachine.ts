// SECTION: Application state vocabulary
// The §37 state machine describes eight states. Three of them are
// terminal (`ACCEPTED`, `REJECTED`, `EXPIRED`); the others form a
// directed acyclic path that can only be walked forward through
// specific transitions.
export type ApplicationState =
  | "DISCOVERED"
  | "SAVED"
  | "PREPARING"
  | "READY"
  | "SUBMITTED"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED";
// End of section: the union is the contract every caller (route handler,
// repository, future frontend state machine) uses. Adding a new state
// requires a database CHECK migration AND a deliberate change here.

// SECTION: Transition table
// Pinned as a const object so a test can assert the exact map. The
// shape is `current -> allowed next states`; states with no outgoing
// transitions (terminal states) are mapped to an empty array.
export const TRANSITIONS: Readonly<
  Record<ApplicationState, readonly ApplicationState[]>
> = {
  DISCOVERED: ["SAVED"],
  SAVED: ["PREPARING", "DISCOVERED"],
  PREPARING: ["READY", "SAVED"],
  READY: ["SUBMITTED", "PREPARING"],
  SUBMITTED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: []
};
// End of section: every transition is explicit. The §37 diagram maps
// directly to this table:
//
//   DISCOVERED -> SAVED
//   SAVED      -> PREPARING | DISCOVERED  (unsave)
//   PREPARING  -> READY | SAVED          (abandon prep)
//   READY      -> SUBMITTED | PREPARING  (found missing doc)
//   SUBMITTED  -> ACCEPTED | REJECTED
//   ACCEPTED   -> (terminal)
//   REJECTED   -> (terminal)
//   EXPIRED    -> (terminal)
//
// A transition from a terminal state to any other state is rejected
// by `canTransition` below.

// SECTION: Pure transition check
export function canTransition(
  from: ApplicationState,
  to: ApplicationState
): boolean {
  return TRANSITIONS[from].includes(to);
}
// End of section: a single source of truth for "is this move allowed?".
// The route handler turns `false` into a 409 with the list of valid
// next states so the frontend can render an honest error.

export function validNextStates(from: ApplicationState): readonly ApplicationState[] {
  return TRANSITIONS[from];
}

export function isTerminal(state: ApplicationState): boolean {
  return TRANSITIONS[state].length === 0;
}
// End of section: `isTerminal` is a convenience the UI (and future
// notifications job) can use to decide whether to render an
// "application closed" state instead of further controls.

// SECTION: Default initial state
// `DISCOVERED` is the implicit state a student is in *before* they've
// taken any action. The POST route accepts an `initialState` override
// (defaulting to `SAVED`) so the "save" button can also create an
// application in `SAVED` rather than `DISCOVERED` — matching the
// blueprint's §37 lifecycle where saving is the first explicit action.
export const DEFAULT_INITIAL_STATE: ApplicationState = "SAVED";
// End of section: choosing `SAVED` over `DISCOVERED` for the default
// matches the demo's intent — clicking "save" lands the student
// squarely in the tracker with a visible state, not an invisible
// "discovered but not yet acted on" row.