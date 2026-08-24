import { describe, it, expect, jest } from "@jest/globals";
import {
  edges,
  nodes,
  graph,
  TRANSITION,
  StateMachine,
  OK,
  UNHANDLED,
  REJECTED,
  TERMINAL,
} from "../src/core/index.js";
import type {
  Carrier,
  Verdict,
  FsmEvent,
  IEvent,
  IState,
  Merge,
  FsmState,
} from "../src/core/index.js";

// ── the tutorial player ──────────────────────────────────────────────────────
type Mode = "idle" | "loading" | "ready" | "playing" | "paused" | "ended";
interface Media {
  t: number;
}
type Σ = Merge<
  | IEvent<"load" | "loaded" | "play" | "pause" | "end">
  | IEvent<"tick", { dt: number }>
>;
type Λ = Merge<IEvent<"started"> | IEvent<"finished", { at: number }>>;

/** A factory, not a shared instance: a machine holds its state, so tests that dispatch
 *  would otherwise see each other's moves. */
export const player = () =>
  new StateMachine<IState<Mode, Media>, Σ, Λ>(
    {
      idle: { load: [{ to: "loading" }] },
      loading: { loaded: [{ to: "ready" }] },
      ready: { play: [{ to: "playing", emit: "started" }] },
      playing: {
        pause: [{ to: "paused" }],
        tick: [{ to: ["playing", (m, p) => ({ t: m.t + p.dt })] }],
        end: [{ to: "ended", emit: ["finished", (m) => ({ at: m.t })] }],
      },
      paused: { play: [{ to: "playing", emit: "started" }] },
      ended: {
        play: [{ to: ["playing", () => ({ t: 0 })], emit: "started" }],
      },
    },
    { type: "idle", context: { t: 0 } },
  );

// ── a turnstile: guards, priority, two rules on one cell ─────────────────────
type Gate = "locked" | "open";
interface Purse {
  paid: number;
}
const PRICE = 2;

export const gate = () =>
  new StateMachine<
    IState<Gate, Purse>,
    IEvent<"coin" | "pass">,
    IEvent<"opened">
  >(
    {
      locked: {
        coin: [
          {
            to: ["locked", (p) => ({ paid: p.paid + 1 })],
            when: (p) => p.paid + 1 < PRICE,
          },
          { to: ["open", () => ({ paid: 0 })], emit: "opened" },
        ],
      },
      open: { pass: [{ to: "locked" }] },
    },
    { type: "locked", context: { paid: 0 } },
  );

/**
 * One transition from a chosen state, as data: `[phase, context, output]`, or `undefined` when
 * nothing fired.
 *
 * The machine hands out no pure transition function, and this is what testing it costs — put
 * the machine where you want it, dispatch, read the state back. The output comes off
 * `TRANSITION`, which is the only place a *silent* transition can be told from a refused one.
 */
const fire = <Q extends Carrier, Σ extends Carrier, Λ extends Carrier>(
  fsm: StateMachine<Q, Σ, Λ>,
  start: FsmState<Q>,
  msg: readonly unknown[],
): undefined | readonly [keyof Q, unknown, FsmEvent<Λ> | undefined] => {
  fsm.restore(start);
  let output: FsmEvent<Λ> | undefined;
  const off = fsm.rx.on(TRANSITION, (t) => {
    output = t.output;
  });
  const fired = (fsm.dispatch as (...a: unknown[]) => Verdict)(...msg);
  off();
  return fired.ok ? [fsm.state.type, fsm.state.context, output] : undefined;
};

describe("dispatch — one transition of the machine", () => {
  it("folds the payload into the data and leaves the source untouched", () => {
    const source = { type: "playing", context: { t: 3 } } as const;
    expect(fire(player(), source, ["tick", { dt: 1 }])).toEqual([
      "playing",
      { t: 4 },
      undefined,
    ]);
    expect(source.context).toEqual({ t: 3 });
  });

  it("carries the data over when the edge has no `with`", () => {
    expect(
      fire(player(), { type: "playing", context: { t: 7 } }, ["pause"]),
    ).toEqual(["paused", { t: 7 }, undefined]);
  });

  it("emits the event with the payload `by` built from the reached data", () => {
    expect(
      fire(player(), { type: "playing", context: { t: 9 } }, ["end"]),
    ).toEqual(["ended", { t: 9 }, { type: "finished", payload: { at: 9 } }]);
  });

  it("emits a bare event when its payload is void", () => {
    expect(
      fire(player(), { type: "ready", context: { t: 0 } }, ["play"]),
    ).toEqual(["playing", { t: 0 }, { type: "started" }]);
  });

  it("fires nothing where the state has no cell for the event", () => {
    expect(
      fire(player(), { type: "ready", context: { t: 0 } }, ["pause"]),
    ).toBeUndefined();
  });

  it("takes the first rule whose guard passes, in list order", () => {
    expect(
      fire(gate(), { type: "locked", context: { paid: 0 } }, ["coin"]),
    ).toEqual(["locked", { paid: 1 }, undefined]);
    expect(
      fire(gate(), { type: "locked", context: { paid: 1 } }, ["coin"]),
    ).toEqual(["open", { paid: 0 }, { type: "opened" }]);
  });

  it("fires nothing when every rule is guarded and none passes", () => {
    const shut = new StateMachine<
      IState<Gate, Purse>,
      IEvent<"coin">,
      IEvent<"opened">
    >(
      { locked: { coin: [{ to: "locked", when: () => false }] } },
      { type: "locked", context: { paid: 0 } },
    );
    expect(shut.dispatch("coin")).toBe(REJECTED);
    expect(shut.state.type).toBe("locked");
    expect(shut.state.context).toEqual({ paid: 0 });
  });

  it("keeps two rules to the same target apart — each carries its own guard", () => {
    const fork = new StateMachine<
      IState<"a" | "b", { n: number }>,
      IEvent<"go">,
      Merge<IEvent<"lo"> | IEvent<"hi">>
    >(
      {
        a: {
          go: [
            { to: "b", emit: "lo", when: (d) => d.n < 10 },
            { to: "b", emit: "hi" },
          ],
        },
      },
      { type: "a", context: { n: 0 } },
    );
    expect(fire(fork, { type: "a", context: { n: 1 } }, ["go"])).toEqual([
      "b",
      { n: 1 },
      { type: "lo" },
    ]);
    expect(fire(fork, { type: "a", context: { n: 99 } }, ["go"])).toEqual([
      "b",
      { n: 99 },
      { type: "hi" },
    ]);
  });
});

describe("can — the question, not the move", () => {
  it("answers whatever the next dispatch of the same message would answer", () => {
    const g = gate();
    expect(g.can("coin")).toBe(g.dispatch("coin")); // guard admits: still filling up
    expect(g.can("coin")).toBe(g.dispatch("coin")); // guard refuses: the fallback opens
    expect(g.can("pass")).toBe(g.dispatch("pass"));
  });

  it("says no where the state has no cell for the event", () => {
    const p = player();
    expect(p.can("play")).toBe(UNHANDLED); // sitting at 'idle', which takes 'load'
    expect(p.can("load")).toBe(OK);
  });

  it("says no when every rule is guarded and none passes", () => {
    const shut = new StateMachine<
      IState<Gate, Purse>,
      IEvent<"coin">,
      IEvent<"opened">
    >(
      { locked: { coin: [{ to: "locked", when: () => false }] } },
      { type: "locked", context: { paid: 0 } },
    );
    expect(shut.can("coin")).toBe(REJECTED);
  });

  it("weighs the payload it is given, not some other one", () => {
    const till = new StateMachine<
      IState<"open", { limit: number }>,
      IEvent<"pay", number>
    >(
      {
        open: { pay: [{ to: "open", when: (d, amount) => amount <= d.limit }] },
      },
      { type: "open", context: { limit: 10 } },
    );
    expect(till.can("pay", 5)).toBe(OK);
    expect(till.can("pay", 50)).toBe(REJECTED);
  });

  it("does not move the machine, and does not run `with` or `by`", () => {
    const built = jest.fn((d: { n: number }) => ({ seen: d.n }));
    const bumped = jest.fn((d: { n: number }) => ({ n: d.n + 1 }));
    const m = new StateMachine<
      IState<"a" | "b", { n: number }>,
      IEvent<"go">,
      IEvent<"out", { seen: number }>
    >(
      { a: { go: [{ to: ["b", bumped], emit: ["out", built] }] } },
      { type: "a", context: { n: 0 } },
    );
    expect(m.can("go")).toBe(OK);
    expect(m.state.type).toBe("a");
    expect(m.state.context).toEqual({ n: 0 });
    expect(bumped).not.toHaveBeenCalled();
    expect(built).not.toHaveBeenCalled();
  });

  it("tells a terminal state from a merely deaf one", () => {
    const oneWay = new StateMachine<IState<"a" | "b">, IEvent<"go">>(
      { a: { go: [{ to: "b" }] } },
      { type: "a", context: undefined },
    );
    expect(oneWay.can("go")).toBe(OK);
    expect(oneWay.dispatch("go")).toBe(OK);
    // 'b' appears only as a target: no cells at all, so nothing will ever fire from it.
    expect(oneWay.can("go")).toBe(TERMINAL);
    expect(oneWay.dispatch("go")).toBe(TERMINAL);
  });
});

describe("freeze — the data handed out is not the caller’s to mutate", () => {
  it("freezes what `with` computed", () => {
    const p = player();
    p.restore({ type: "playing", context: { t: 0 } });
    p.dispatch("tick", { dt: 1 });
    expect(Object.isFrozen(p.state.context)).toBe(true);
  });

  it("freezes the pass-through too — the case an absent `with` would have missed", () => {
    const p = player();
    p.restore({ type: "playing", context: { t: 5 } });
    p.dispatch("pause");
    expect(Object.isFrozen(p.state.context)).toBe(true);
  });
});

describe("the constructor — one artifact, so nothing is left to join", () => {
  it("takes a schema with no operations at all", () => {
    const turn = new StateMachine<IState<"a" | "b">, IEvent<"go">>(
      { a: { go: [{ to: "b" }] }, b: { go: [{ to: "a" }] } },
      { type: "a", context: undefined },
    );
    expect(fire(turn, { type: "a", context: undefined }, ["go"])).toEqual([
      "b",
      undefined,
      undefined,
    ]);
    expect(turn.toJSON()).toEqual({
      a: { go: [{ to: "b" }] },
      b: { go: [{ to: "a" }] },
    });
  });
});

describe("graph / toJSON — the code forgotten, the names kept", () => {
  it("keeps a guard as its name — `?` for the anonymous arrows here", () => {
    expect(gate().toJSON()).toEqual({
      locked: {
        coin: [
          { to: ["locked", "?"], when: "?" },
          { to: ["open", "?"], emit: "opened" },
        ],
      },
      open: { pass: [{ to: "locked" }] },
    });
  });

  it("reads a dumped guard as ⊤ — which is what makes the dump runnable", () => {
    const dumped = new StateMachine<
      IState<Gate, Purse>,
      IEvent<"coin" | "pass">,
      IEvent<"opened">
    >(gate().toJSON() as never, { type: "locked", context: { paid: 0 } });
    expect(
      fire(dumped, { type: "locked", context: { paid: 0 } }, ["coin"]),
    ).toEqual(["locked", { paid: 0 }, undefined]); // fires, and changes nothing
  });

  it("is what `JSON.stringify(machine)` writes", () => {
    const p = player();
    expect(JSON.stringify(p)).toBe(JSON.stringify(p.toJSON()));
  });

  it("is not what a plain `stringify` of the schema writes", () => {
    // It never was — `stringify` drops the operations and cannot lift a guard to `true`, so a
    // raw schema through JSON loses the fact that a rule was guarded at all. What is new is that
    // it now loses it *visibly*: a target is a pair, and an array keeps the hole its function
    // left as `null`. Which is the better failure of the two. Silently dropping `with` produced
    // a schema that still parsed and quietly meant something else; `["open", null]` is a shape
    // nothing will read back, and the thing that writes a dump is `toJSON`, above.
    const g = gate();
    expect(JSON.parse(JSON.stringify(g.schema))).toEqual({
      locked: {
        coin: [
          { to: ["locked", null] },
          { to: ["open", null], emit: "opened" },
        ],
      },
      open: { pass: [{ to: "locked" }] },
    });
  });

  it("is the same projection as the free `graph`", () => {
    const p = player();
    expect(p.toJSON()).toEqual(graph(p.schema));
  });

  it("round-trips into a schema that constructs and runs — the total machine", () => {
    const reloaded = new StateMachine<IState<Mode, Media>, Σ, Λ>(
      JSON.parse(JSON.stringify(player())) as never,
      { type: "playing", context: { t: 3 } },
    );
    // no `with` survived, so the data is carried over unchanged
    expect(
      fire(reloaded, { type: "playing", context: { t: 3 } }, [
        "tick",
        { dt: 1 },
      ]),
    ).toEqual(["playing", { t: 3 }, undefined]);
  });
});

describe("edges / nodes — the schema read as a relation", () => {
  it("is the rule itself with its two coordinates in front", () => {
    const [row] = edges({
      a: {
        go: [{ to: ["b", (d: number) => d], emit: ["out", () => 1] }],
      },
    });
    expect(row.from).toBe("a");
    expect(row.on).toBe("go");
    expect(row.to).toBe("b");
    expect(row.emit).toBe("out");
    expect(typeof row.with).toBe("function");
    expect(typeof row.by).toBe("function");
  });

  it("sees a node written with an empty cell, which has no rows to be found by", () => {
    expect(nodes({ a: { go: [{ to: "b" }] }, ghost: {} })).toEqual([
      "a",
      "ghost",
      "b",
    ]);
  });
});
