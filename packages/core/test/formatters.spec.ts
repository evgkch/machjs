import { describe, it, expect } from "@jest/globals";
import { StateMachine, edges } from "../src/core/index.js";
import type { IEvent, IState, Merge, Schema } from "../src/core/index.js";
import { validate } from "../src/analysis/index.js";
import {
  toMermaid,
  toDot,
  toTree,
  toRules,
  formatIssues,
  edgeLabel,
} from "../src/formatters/index.js";
import { player, gate } from "./core.spec.js";

describe("toRules — the schema as rules", () => {
  it("prints one statement per row, node-major, with a column per operation present", () => {
    expect(toRules(player().schema)).toBe(
      [
        "FROM idle    ON load   TO loading",
        "FROM loading ON loaded TO ready",
        "FROM ready   ON play   TO playing        EMIT started",
        "FROM playing ON pause  TO paused",
        "FROM playing ON tick   TO playing WITH ?",
        "FROM playing ON end    TO ended          EMIT finished BY ?",
        "FROM paused  ON play   TO playing        EMIT started",
        "FROM ended   ON play   TO playing WITH ? EMIT started",
      ].join("\n"),
    );
  });

  it("prints the same line off the graph form — names survive the dump, code does not", () => {
    expect(toRules(player().toJSON())).toBe(toRules(player().schema));
  });

  it("keeps the guard visible on the graph form — a dumped diagram must not read as a fork", () => {
    expect(toRules(gate().toJSON())).toBe(
      [
        "FROM locked ON coin WHEN ? TO locked WITH ?",
        "FROM locked ON coin        TO open   WITH ? EMIT opened",
        "FROM open   ON pass        TO locked",
      ].join("\n"),
    );
  });

  it("marks an operation with no name of its own as `?`", () => {
    expect(toRules(gate().schema)).toBe(
      [
        "FROM locked ON coin WHEN ? TO locked WITH ?",
        "FROM locked ON coin        TO open   WITH ? EMIT opened",
        "FROM open   ON pass        TO locked",
      ].join("\n"),
    );
  });

  it("drops a marker column entirely when no edge has it", () => {
    expect(toRules({ a: { go: [{ to: "b" }] } })).toBe("FROM a ON go TO b");
  });
});

describe("toRules / toTree — named operations", () => {
  const ready = (d: { n: number }) => d.n > 0;
  const bump = (d: { n: number }) => ({ n: d.n + 1 });
  const named = () =>
    new StateMachine<
      IState<"a" | "b", { n: number }>,
      IEvent<"go">,
      IEvent<"out", { n: number }>
    >(
      {
        a: {
          go: [{ to: ["b", bump], when: ready, emit: ["out", bump] }],
        },
      },
      { type: "a", context: { n: 0 } },
    );

  it("takes the function's own name — nobody writes it down", () => {
    expect(toRules(named().schema)).toBe(
      "FROM a ON go WHEN ready TO b WITH bump EMIT out BY bump",
    );
  });

  it("carries the same names into the tree", () => {
    expect(toTree(named().schema, { at: "a" })).toBe(
      ["a", "  └─ ON go WHEN ready WITH bump EMIT out → b"].join("\n"),
    );
  });

  it("falls back to `?` for an inline arrow, which has no name of its own", () => {
    const anon = new StateMachine<
      IState<"a" | "b", { n: number }>,
      IEvent<"go">
    >(
      { a: { go: [{ to: "b", when: (d) => d.n > 0 }] } },
      { type: "a", context: { n: 0 } },
    );
    expect(toRules(anon.schema)).toBe("FROM a ON go WHEN ? TO b");
  });
});

describe("toMermaid / toDot", () => {
  it("renders edges, the start marker and the current node", () => {
    const src = toMermaid(
      { a: { go: [{ to: "b" }] } },
      { start: "a", current: "b", direction: "LR" },
    );
    expect(src).toContain("direction LR");
    expect(src).toContain("[*] --> a");
    expect(src).toContain("a --> b: ON go");
    expect(src).toContain("class b current");
  });

  it("quotes node ids in DOT and carries the same label", () => {
    const src = toDot(gate().schema, { start: "locked" });
    expect(src).toContain(
      '"locked" -> "locked" [label="ON coin WHEN ? WITH ?"];',
    );
    expect(src).toContain(
      '"locked" -> "open" [label="ON coin WITH ? EMIT opened"];',
    );
    expect(src.startsWith("digraph FSM {")).toBe(true);
  });
});

describe("toTree — the adjacency tree", () => {
  it("groups rows under their node and marks dead ends", () => {
    expect(toTree({ a: { go: [{ to: "b" }] } })).toBe(
      ["a", "  └─ ON go → b", "b ∎"].join("\n"),
    );
  });

  it("gives a node written with an empty cell a line of its own", () => {
    expect(toTree({ a: { go: [{ to: "b" }] }, ghost: {} })).toBe(
      ["a", "  └─ ON go → b", "ghost ∎", "b ∎"].join("\n"),
    );
  });

  it("prints one node’s slice with `at` — one lookup, the schema being node-major", () => {
    expect(toTree(player().schema, { at: "playing" })).toBe(
      [
        "playing",
        "  ├─ ON pause → paused",
        "  ├─ ON tick WITH ? → playing",
        "  └─ ON end EMIT finished → ended",
      ].join("\n"),
    );
  });

  it("marks the current node", () => {
    expect(toTree({ a: { go: [{ to: "b" }] } }, { current: "a" })).toContain(
      "a ●",
    );
  });
});

describe("a label of your own", () => {
  it("stands in for the default in every renderer that draws edges", () => {
    const brief = (r: { on: PropertyKey }) => String(r.on);
    expect(toMermaid({ a: { go: [{ to: "b" }] } }, { label: brief })).toContain(
      "a --> b: go",
    );
    expect(toDot({ a: { go: [{ to: "b" }] } }, { label: brief })).toContain(
      '[label="go"]',
    );
    expect(toTree({ a: { go: [{ to: "b" }] } }, { label: brief })).toContain(
      "└─ go → b",
    );
  });
});

describe("edgeLabel", () => {
  it("says an edge the way the shipped renderers do", () => {
    const [row] = edges(gate().schema);
    expect(edgeLabel(row)).toBe("ON coin WHEN ? WITH ?");
    expect(toTree(gate().schema, { at: "locked" })).toContain(edgeLabel(row));
    expect(toMermaid(gate().schema)).toContain(edgeLabel(row));
  });
});

describe("formatIssues", () => {
  it("renders issues with a severity glyph", () => {
    type G = Schema<
      IState<"a" | "b" | "c">,
      Merge<IEvent<"go"> | IEvent<"back">>,
      {}
    >;
    const schema = {
      a: { go: [{ to: "b" }] },
      c: { back: [{ to: "a" }] },
    } satisfies G;
    const report = formatIssues(validate(schema, "a"));
    expect(report).toContain("✗ error");
    expect(report).toContain("⚠ warning");
  });

  it("says so when there is nothing to report", () => {
    expect(formatIssues([])).toBe("no issues");
  });
});
