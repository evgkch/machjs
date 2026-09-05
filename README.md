**English** · [Русский](README.ru.md)

<p align="center">
  <a href="https://www.npmjs.com/package/@evgkch/machjs"><img alt="npm: @evgkch/machjs" src="https://img.shields.io/npm/v/%40evgkch%2Fmachjs?color=cb3837&logo=npm&label=machjs"></a>
  <a href="https://www.npmjs.com/package/@evgkch/machjs-inspector"><img alt="npm: @evgkch/machjs-inspector" src="https://img.shields.io/npm/v/%40evgkch%2Fmachjs-inspector?color=cb3837&logo=npm&label=inspector"></a>
  <a href="https://github.com/evgkch/machjs/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/evgkch/machjs/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

# machjs

A Mealy state machine for TypeScript: one table of rules, a context that belongs to the state rather than to the machine, and a graph that is a projection of the same object — serialize it, draw it, analyse it. The repository holds the library, the inspector, and the examples.

<p align="center">
  <a href="packages/core/README.md">Guide</a> ·
  <a href="https://evgkch.github.io/machjs/">Examples</a> ·
  <a href="https://evgkch.github.io/machjs/inspector/">Inspector</a> ·
  <a href="https://github.com/evgkch/machjs/issues">Issues</a>
</p>

---

## In a minute

### Step 1. Four words

A rule is a sentence of four words: **FROM** a state, **ON** an event, **TO** a state, and an optional **EMIT** on the way out. A turnstile is two rules:

```text
FROM locked ON coin TO open   EMIT opened
FROM open   ON push TO locked
```

The same two rules as code. A schema is a table: state, event, the rules for that pair.

```ts
import { StateMachine } from "@evgkch/machjs";
import type { IState, IEvent, Merge } from "@evgkch/machjs";

type Q = IState<"locked" | "open">;                // states
type Σ = Merge<IEvent<"coin"> | IEvent<"push">>;   // input events
type Λ = IEvent<"opened">;                         // output events

const gate = new StateMachine<Q, Σ, Λ>(
  {
    locked: { coin: [{ to: "open", emit: "opened" }] },
    open:   { push: [{ to: "locked" }] },
  },
  { type: "locked", context: undefined },
);

gate.rx.on("opened", () => console.log("the gate opens"));

gate.dispatch("push"); // UNHANDLED — locked has no rule for it
gate.dispatch("coin"); // OK — the transition, and opened on the way out
gate.state.type;       // "open"
```

No handler tests the phase: the event goes to `dispatch`, and what happens to it is written in the schema.

### Step 2. Three more words

A full rule is seven words; everything but `FROM`, `ON` and `TO` is optional:

```text
FROM <state> ON <event> [WHEN <guard>] TO <state> [WITH <context>] [EMIT <event> [BY <data>]]
```

The order of execution is `WHEN` → `TO` → `WITH` → `EMIT` → `BY`. `BY` works on the context already updated.

The same gate, but the fare is two coins. What was paid sits in the state's context, not in the machine:

```text
FROM locked ON coin WHEN short TO locked WITH add
FROM locked ON coin            TO open   WITH add   EMIT opened BY fare
FROM open   ON push            TO locked WITH clear
```

```ts
import { StateMachine } from "@evgkch/machjs";
import type { IState, IEvent, Merge } from "@evgkch/machjs";

type Paid = { paid: number };

type Q = Merge<IState<"locked", Paid> | IState<"open", Paid>>;
type Σ = Merge<IEvent<"coin"> | IEvent<"push">>;
type Λ = IEvent<"opened", Paid>;

const FARE = 2;

const short = (c: Paid) => c.paid + 1 < FARE;    // WHEN: the guard
const add = (c: Paid) => ({ paid: c.paid + 1 }); // WITH: the target's context
const clear = () => ({ paid: 0 });
const fare = (c: Paid) => ({ paid: c.paid });    // BY: the output event's data

const gate = new StateMachine<Q, Σ, Λ>(
  {
    locked: {
      coin: [
        { when: short, to: ["locked", add] },
        { to: ["open", add], emit: ["opened", fare] },
      ],
    },
    open: { push: [{ to: ["locked", clear] }] },
  },
  { type: "locked", context: { paid: 0 } },
);

gate.rx.on("opened", ({ paid }) => console.log(`open, ${paid} paid`));

gate.dispatch("coin"); // locked → locked, paid = 1
gate.dispatch("coin"); // locked → open,   paid = 2, and opened on the way out
gate.dispatch("push"); // open   → locked, paid = 0
```

The first coin leaves the gate shut: `short` lets its rule through only while less than the fare is paid. The second coin does not match that rule, so the next one in the same cell is taken — the one with no guard, and it is what opens the gate. An unconditional rule stands last in its cell: a rule after it can never fire, and `validate` from `analysis` finds it as `dead-rule`.

The rule text above is not an illustration. It is what `toRules(gate.schema)` from `formatters` prints, and what the inspector's editor reads.

Next: `can` runs the same check the next `dispatch` will run. That is what enables a control, with no phase test written by hand.

```ts
button.disabled = !gate.can("push").isOk();
```

The [guide](packages/core/README.md) has the rest.

## What is here

| Directory                                  | Package                                                                              | What is in it                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [`packages/core`](packages/core)           | [`@evgkch/machjs`](https://www.npmjs.com/package/@evgkch/machjs)                     | The machine, and the schema it is written as                 |
| [`packages/inspector`](packages/inspector) | [`@evgkch/machjs-inspector`](https://www.npmjs.com/package/@evgkch/machjs-inspector) | Six widgets, two pages, the relay, the palette               |
| [`examples`](examples)                     | private                                                                              | Four pages on the library and the widgets, a walkthrough each |

`packages/` holds the published packages, and nothing else. `analysis`, `formatters` and `debug` are entry points of `@evgkch/machjs`, not packages of their own: the version is one.

## Documentation

| Document                                                                                                | What it covers                                                 |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Guide](packages/core/README.md) · [Руководство](packages/core/README.ru.md)                             | The rule language, the schema, the verdicts, the graph, analysis |
| [Inspector](packages/inspector/README.md) · [Инспектор](packages/inspector/README.ru.md)                 | The entry points, the widgets, the relay, the schema files       |
| [Examples](examples/README.md) · [Примеры](examples/README.ru.md)                                        | The four pages and the shell they share                          |
| [Contributing](CONTRIBUTING.md) · [Как работать](CONTRIBUTING.ru.md)                                     | Building, the tests, releasing                                   |

## License

[MIT](LICENSE)
