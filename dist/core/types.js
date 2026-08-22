/**
 * Type primitives for the machine.
 *
 * A machine is one schema: state → event type → rules. A rule is five words, one column per
 * fact:
 *
 *   | word   | kind     | what it says                                              |
 *   |--------|----------|-----------------------------------------------------------|
 *   | `to`   | label    | the target state                                          |
 *   | `with` | function | `(context, payload) => Q[to]` — the context arrived with   |
 *   | `emit` | label    | the output event type λ                                   |
 *   | `by`   | function | `(context, payload) => Λ[λ]` — that event's payload       |
 *   | `when` | function | `(context, payload) => boolean` — does this apply         |
 *
 * `to` is always required. `with` is required exactly where the target state carries something
 * the source does not, and forbidden where the target carries nothing; `by` is required exactly
 * where the emitted event carries data, forbidden where it does not — both are type errors, not
 * runtime checks.
 *
 * `toJSON` maps a schema onto `Graph`, keeping each label and replacing each function with its
 * *name* (`'?'` if none) — `JSON.stringify` alone already drops function-valued properties, so
 * this is what fills the gap. `when`'s presence must survive even unnamed: it decides whether a
 * rule applies, so dropping it would make a dumped machine read as nondeterministic instead of
 * conditional.
 *
 * `Q`, `Σ` and `Λ` are all carriers: `Σ`/`Λ` are event type ↦ payload, `Q` is state ↦ context.
 * The alphabets are `keyof Σ`/`keyof Λ`/`keyof Q`; a single element is written `q` or `σ`, and
 * `Q[q]` is the context of state `q`.
 */
export {};
// No `Accepts<T, q>` / `Reached<T, σ, q>` here: they typed a transition chain like Rust's
// typestate, but only paid off when the event type was known at compile time. An event arrives
// from a handler at run time, so what is left is `can(type, payload?)`.
