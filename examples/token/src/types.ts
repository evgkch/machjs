/**
 * The vocabulary of one machine: the lifetime of an access token.
 *
 * The requests are not in it. A request is a thing the page keeps; what the machine holds is
 * whether there is a usable token, whether one is being fetched, and how many callers are waiting
 * on the answer. That split is the whole design: five requests that all get a 401 are five rows
 * on the page and one event to the machine.
 */
import type { IEvent, IState, Merge } from "@evgkch/machjs";

export type Token = string;

/**
 * The context belongs to the phase, and the phases carry different things.
 *
 * `refreshing` has no token, and that is the point: while one is being fetched the old one is
 * known to be refused, so there is nothing to send. A caller physically cannot reach for it —
 * `Q["refreshing"]` has no such field. `dead` has no token either; it has the reason instead.
 */
export type Q = Merge<
  | IState<"ok", { token: Token }>
  | IState<"refreshing", { waiting: number }>
  | IState<"dead", { why: string }>
>;

export type Σ = Merge<
  // A caller was refused, or asked while there was nothing to ask with. One event, whichever it
  // was: from the token's side both mean "one more caller has nothing to send".
  | IEvent<"denied">
  | IEvent<"renewed", { token: Token }>
  | IEvent<"failed", { why: string }>
  // Out of `dead`, when somebody decides to try the refresh again.
  | IEvent<"retry">
>;

export type Λ = Merge<
  // Go and fetch one. Emitted from `ok` alone, which is the whole of "refresh exactly once".
  | IEvent<"refresh">
  | IEvent<"wake", { token: Token }>
  | IEvent<"giveUp", { why: string }>
>;
