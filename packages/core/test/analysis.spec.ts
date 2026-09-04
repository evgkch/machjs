import { describe, it, expect } from "@jest/globals";
import { StateMachine } from "../src/core/index.js";
import type { IEvent, IState, Merge, Schema } from "../src/core/index.js";
import { analyze, validate, paths } from "../src/analysis/index.js";
import { player } from "./core.spec.js";

const kinds = (issues: { kind: string }[]) => issues.map((i) => i.kind).sort();

type Two = Schema<
  IState<"a" | "b" | "c", { n: number }>,
  Merge<IEvent<"go"> | IEvent<"back"> | IEvent<"stop">>,
  {}
>;

/** A machine over `{ n }` with one event, so a guard has something to read. */
const guarded = (
  schema: Schema<IState<"a" | "b", { n: number }>, IEvent<"go">, IEvent<"go">>,
) =>
  new StateMachine<IState<"a" | "b", { n: number }>, IEvent<"go">>(schema, {
    type: "a",
    context: { n: 0 },
  });

describe("analyze", () => {
  it("collects every node named as a source or a target", () => {
    expect([...analyze(player().schema).nodes].sort()).toEqual([
      "ended",
      "idle",
      "loading",
      "paused",
      "playing",
      "ready",
    ]);
  });

  it("walks reachability from a start node", () => {
    const { reachable, unreachable } = analyze(player().schema, "idle");
    expect([...reachable].sort()).toEqual([
      "ended",
      "idle",
      "loading",
      "paused",
      "playing",
      "ready",
    ]);
    expect(unreachable).toEqual([]);
  });

  it("reports what the start cannot reach", () => {
    const schema = {
      a: { go: [{ to: "b" }] },
      c: { back: [{ to: "a" }] },
    } satisfies Two;
    expect(analyze(schema, "a").unreachable).toEqual(["c"]);
  });

  it("sees a node declared with an empty cell — it has no rows to be found by", () => {
    const schema = { a: { go: [{ to: "b" }] }, ghost: {} } satisfies Schema<
      IState<"a" | "b" | "ghost">,
      IEvent<"go">,
      {}
    >;
    expect(analyze(schema, "a").unreachable).toEqual(["ghost"]);
    expect(analyze(schema).terminal).toEqual(["ghost", "b"]);
  });
});

describe("validate", () => {
  it("passes a sound schema, in either form", () => {
    expect(
      validate(player().schema, "idle").filter((i) => i.severity === "error"),
    ).toEqual([]);
    expect(
      validate(player().toJSON(), "idle").filter((i) => i.severity === "error"),
    ).toEqual([]);
  });

  it("says nothing about a cell whose rules end in an unguarded one", () => {
    const sound = guarded({
      a: { go: [{ to: "a", when: (d) => d.n > 0 }, { to: "b" }] },
    });
    expect(kinds(validate(sound.schema))).not.toContain("dead-rule");
  });

  it("flags an unreachable node as an error and a dead end as a warning", () => {
    const schema = {
      a: { go: [{ to: "b" }] },
      c: { back: [{ to: "a" }] },
    } satisfies Two;
    expect(kinds(validate(schema, "a"))).toEqual(["terminal", "unreachable"]);
  });

  it("flags two rules a run cannot tell apart", () => {
    const schema = { a: { go: [{ to: "b" }, { to: "b" }] } } satisfies Two;
    expect(validate(schema).map((i) => i.kind)).toContain("duplicate-edge");
  });

  it("flags two rules that share one guard object — the second can never fire", () => {
    const ready = (d: { n: number }) => d.n > 0;
    const twice = guarded({
      a: {
        go: [
          { to: "b", when: ready },
          { to: "b", when: ready },
        ],
      },
    });
    expect(validate(twice.schema).map((i) => i.kind)).toContain(
      "duplicate-edge",
    );
  });

  it("does not flag two rules to the same target with guards of their own", () => {
    const forked = guarded({
      a: {
        go: [
          { to: "b", when: (d) => d.n > 0 },
          { to: "b", when: (d) => d.n < 0 },
        ],
      },
    });
    expect(validate(forked.schema).map((i) => i.kind)).not.toContain(
      "duplicate-edge",
    );
  });

  it("flags a rule sitting after an unguarded one as dead", () => {
    const schema = { a: { go: [{ to: "a" }, { to: "b" }] } } satisfies Two;
    const dead = validate(schema).find((i) => i.kind === "dead-rule");
    expect(dead?.severity).toBe("error");
    expect(dead?.message).toMatch(/can never fire/);
  });

  it("does not call it dead when the earlier rule is guarded", () => {
    const machine = guarded({
      a: { go: [{ to: "a", when: (d) => d.n > 0 }, { to: "b" }] },
    });
    expect(validate(machine.schema).map((i) => i.kind)).not.toContain(
      "dead-rule",
    );
  });

  it("says nothing about a cell whose every rule is guarded — a refusal is a legal outcome", () => {
    // An absent `when` reads as ⊤, so a guarded cell is not a careless one: it is a cell
    // where the event can be refused, which is the partiality of δ and not a defect.
    const machine = guarded({ a: { go: [{ to: "b", when: (d) => d.n > 0 }] } });
    const cellFindings = validate(machine.schema).filter(
      (i) => i.event === "go",
    );
    expect(cellFindings).toEqual([]);
  });

  it("gives the same verdict on the graph form — presence is all these checks need", () => {
    const machine = guarded({ a: { go: [{ to: "b", when: (d) => d.n > 0 }] } });
    expect(validate(machine.toJSON()).map((i) => i.kind)).toEqual(
      validate(machine.schema).map((i) => i.kind),
    );
  });

  it("does not call a guarded first rule dead once the schema is dumped", () => {
    const sound = guarded({
      a: { go: [{ to: "a", when: (d) => d.n > 0 }, { to: "b" }] },
    });
    expect(validate(sound.toJSON()).map((i) => i.kind)).not.toContain(
      "dead-rule",
    );
  });

  it("stops comparing guards on a dumped schema, where they are all the same `true`", () => {
    const forked = guarded({
      a: {
        go: [
          { to: "b", when: (d) => d.n > 0 },
          { to: "b", when: (d) => d.n < 0 },
        ],
      },
    });
    expect(validate(forked.toJSON()).map((i) => i.kind)).not.toContain(
      "duplicate-edge",
    );
  });
});

describe("paths", () => {
  it("enumerates runs to a dead end and loops that close", () => {
    const schema = {
      a: { go: [{ to: "b" }] },
      b: { go: [{ to: "a" }], stop: [{ to: "c" }] },
    } satisfies Two;
    const found = paths(schema, "a");
    expect(found.filter((p) => p.kind === "cycle").map((p) => p.nodes)).toEqual(
      [["a", "b", "a"]],
    );
    expect(
      found.filter((p) => p.kind === "terminal").map((p) => p.nodes),
    ).toEqual([["a", "b", "c"]]);
  });

  it("carries the traversed rows as legs", () => {
    const schema = { a: { go: [{ to: "b" }] } } satisfies Two;
    expect(paths(schema, "a")[0].legs).toEqual([
      { from: "a", on: "go", to: "b" },
    ]);
  });
});
