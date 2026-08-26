/**
 * The vocabulary of both machines, and of the two messages that cross between them.
 *
 * Two machines, not one: the terminal's Λ is the host's Σ and the host's Λ is the terminal's Σ,
 * and the wire in between is the only thing either of them shares. Nothing here is common to both
 * except `Ask` and `Say` — that is what makes the pair a protocol rather than one machine written
 * in two halves.
 */
import type { IEvent, IState, Merge } from "@evgkch/machjs";

/** Money, in the smallest unit. Nothing near a balance is a float. */
export type Cents = number;

/**
 * What the terminal asks. `ticket` is the attempt's number, and it is the whole of how an answer
 * is matched to a question: both machines carry it, neither trusts the order of arrival.
 */
export type Ask = {
  readonly ticket: number;
  readonly pan: string;
  readonly amount: Cents;
};

/** What the host answers, and the ticket it is about. */
export type Say = {
  readonly ticket: number;
  readonly ok: boolean;
  readonly why: string;
};

// ── the terminal ────────────────────────────────────────────────────────────

/**
 * The card, and the last ticket this terminal used.
 *
 * The counter lives in the context because an operation is a pure function of `(context,
 * payload)` — a `next()` that incremented a variable outside would make the same schema run two
 * ways. `booked` reads `ticket + 1`, and the number the machine is waiting on is a fact about the
 * state it is waiting in.
 */
export type Card = { readonly pan: string; readonly ticket: number };

/** Digits as they are being pressed, before they are money. */
export type Typed = Card & { readonly typed: string };

/** On the wire: the ticket in `Card` is the one in flight. */
export type Flight = Card & { readonly amount: Cents };

/** Answered, one way or the other, with what the host said about it. */
export type Done = Flight & { readonly why: string };

export type TQ = Merge<
  | IState<"idle", Card>
  | IState<"entering", Typed>
  | IState<"waiting", Flight>
  | IState<"approved", Done>
  | IState<"declined", Done>
>;

export type TΣ = Merge<
  | IEvent<"key", { digit: string }>
  | IEvent<"rub">
  | IEvent<"send">
  // The host, answering. An answer about another ticket satisfies no guard in `waiting`, so it
  // matches no rule and is dropped — which is the whole of handling a duplicate or a straggler.
  | IEvent<"said", Say>
  // The reader's own patience running out. There is no timer: a wire that is cut delivers
  // nothing, and the machine sits in `waiting` until somebody says otherwise.
  | IEvent<"giveUp">
  | IEvent<"again">
>;

export type TΛ = IEvent<"auth", Ask>;

// ── the host ────────────────────────────────────────────────────────────────

/**
 * The balance, and every ticket already answered with the answer it was given.
 *
 * `seen` is what makes the protocol idempotent: a question that arrives twice is answered twice
 * with the same words, and the balance moves once.
 */
export type Ledger = {
  readonly balance: Cents;
  readonly seen: Readonly<Record<number, Say>>;
};

/** Checking one question. The question is in the context, because that is what it is checking. */
export type Working = Ledger & { readonly ask: Ask };

export type HQ = Merge<
  IState<"listening", Ledger> | IState<"working", Working>
>;

export type HΣ = Merge<
  | IEvent<"auth", Ask>
  // The check finished. It carries the ticket it is about, so a `ready` for a question the host
  // is no longer on satisfies no guard — the same match by ticket the terminal makes.
  | IEvent<"ready", { ticket: number }>
>;

export type HΛ = IEvent<"said", Say>;
