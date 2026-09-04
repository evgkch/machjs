/**
 * Backward-compatibility contract, checked by the compiler.
 *
 * The log features we deliberately did not build — a dwell-time column, colour, richer sinks —
 * must remain addable without breaking a caller. Each block below declares a *future* signature
 * and then replays code written against *today's* one; the file typechecking is the proof that the
 * change is additive. Block 6 pins the shape to never ship.
 *
 * This file declares types and never runs. If a future edit makes it fail, that edit is a breaking
 * change, and the failure is the point.
 *
 * Rules it does not check, and which no compiler can:
 *   - a new option defaults to off, so `log(fsm)` keeps printing exactly what it prints today;
 *   - a sink keeps receiving the transition itself, never a rendering of it, and the line `rules`
 *     writes stays free of escape codes, so a file sink stays usable.
 */
import { StateMachine } from "../src/core/index.js";
import type { AnyMachine, Schema, Transition, Off } from "../src/core/index.js";
import type { Carrier, IEvent, IState, Merge } from "../src/core/types.js";
import type { Formatter } from "../src/formatters/types.js";

type M = StateMachine<
  IState<"a" | "b", { n: number }>,
  IEvent<"go">,
  IEvent<"out", { n: number }>
>;

// ── 1. adding a third parameter (options) ────────────────────────────────────
type LogOptions = { time?: boolean; color?: boolean };
declare function logV2<Q extends Carrier, Σ extends Carrier, Λ extends Carrier>(
  fsm: StateMachine<Q, Σ, Λ>,
  sink?: (transition: Transition<Q, Σ, Λ>) => void,
  options?: LogOptions,
): Off;

declare const m: M;
const a1: Off = logV2(m); // today's call, no sink
const a2: Off = logV2(m, (t) => console.log(t)); // today's call, whole transition
const a3: Off = logV2(m, (t) => console.log(t.output)); // today's call, one field of it
const a4: Off = logV2(m, undefined, { time: true }); // tomorrow's call

// ── 2. appending an argument to the sink ─────────────────────────────────────
/** Suppose a later version hands the sink a second value (dwell time, in ms). */
declare function logV3<Q extends Carrier, Σ extends Carrier, Λ extends Carrier>(
  fsm: StateMachine<Q, Σ, Λ>,
  sink?: (transition: Transition<Q, Σ, Λ>, since: number) => void,
): Off;

const b1: Off = logV3(m, () => console.log("fired")); // ignores both
const b2: Off = logV3(m, (t) => console.log(t.input)); // ignores the new one
const b3: Off = logV3(m, (t, since) => console.log(t.input, since));

// ── 3. returning something richer than `Off` ─────────────────────────────────
/** A callable with properties is still an `Off`, so the return type can grow. */
type OffPlus = Off & { readonly seen: number };
declare const rich: OffPlus;
const c1: Off = rich; // assignable — no break for `const off = log(m)`
const c2: boolean = rich();

// ── 4. adding a field to an options type ────────────────────────────────────
type TextOptionsV1<Q extends string> = { current?: Q; color?: boolean; at?: Q };
type TextOptionsV2<Q extends string> = TextOptionsV1<Q> & { compact?: boolean };
const d1: TextOptionsV2<"a"> = { at: "a", color: true }; // object written for V1

// ── 5. giving a Formatter options where it had none ─────────────────────────
// `Formatter` is the real one, imported above: its default is what makes this block pass
declare const rulesV2: Formatter<unknown, { color?: boolean }>;
const e1: Formatter<unknown> = rulesV2; // still fits the bare contract
const e3: Record<string, Formatter<unknown>> = { one: rulesV2 };
const e2: string = rulesV2({}); // today's one-argument call

// ── 6. what is NOT safe, kept here as the counter-example ───────────────────
/** Making the sink required, or reordering the parameters, breaks every caller. */
declare function logBad<
  Q extends Carrier,
  Σ extends Carrier,
  Λ extends Carrier,
>(options: LogOptions, fsm: StateMachine<Q, Σ, Λ>): Off;
// @ts-expect-error — argument order changed: this is the shape to never ship
const f1: Off = logBad(m, { time: true });

void [a1, a2, a3, a4, b1, b2, b3, c1, c2, d1, e1, e2, e3, f1];

// A real machine — contexts, payloads and all — is an `AnyMachine` with nothing said about it.
// This is the whole point of that type: what is written *about* machines cannot ask for the erased
// shape, because no application's machine is ever in it.
{
  type Q = IState<"idle" | "busy", { n: number }>;
  type Σ = IEvent<"go", { by: number }>;
  type Λ = IEvent<"done", { n: number }>;
  const fsm = new StateMachine<Q, Σ, Λ>(
    {
      idle: {
        go: [
          {
            to: ["busy", (c, p) => ({ n: c.n + p.by })],
            emit: ["done", (c) => ({ n: c.n })],
          },
        ],
      },
      busy: { go: [{ to: "idle" }] },
    },
    { type: "idle", context: { n: 0 } },
  );
  const any: AnyMachine = fsm;
  const name: PropertyKey = any.state.type;
  void name;
}

// The carrier is required exactly when the target's context cannot be the source's, and that is
// decided by the two contexts alone. Three cases, and the compiler holds all three: `@ts-expect-error`
// fails the build if either of the last two ever stops being an error.
{
  type Q = Merge<
    | IState<"a" | "b", { x: number }> // same shape at both ends
    | IState<"c", { y: string }> // a different one
    | IState<"d"> // and one that carries nothing
  >;
  type Σ = IEvent<"go">;

  // Same context: the bare name is enough, and the carrier defaults to the identity.
  const same: Schema<Q, Σ, IEvent<never>> = { a: { go: [{ to: "b" }] } };

  // Different context: naming the state alone is not a transition anyone can take.
  const differs: Schema<Q, Σ, IEvent<never>> = {
    // @ts-expect-error — `c` carries a `{ y: string }` that nothing here builds
    a: { go: [{ to: "c" }] },
  };

  // Carries nothing: there is no context to build, so a pair has nothing to be.
  const none: Schema<Q, Σ, IEvent<never>> = {
    // @ts-expect-error — `d` carries nothing, so there is nothing for a carrier to return
    a: { go: [{ to: ["d", () => undefined] }] },
  };

  void [same, differs, none];
}
