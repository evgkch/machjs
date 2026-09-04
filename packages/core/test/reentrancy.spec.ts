import { describe, it, expect } from "@jest/globals";
import { StateMachine, BUSY, OK } from "../src/core/index.js";
import type { Verdict, IEvent, IState, Merge } from "../src/core/index.js";
import { history } from "../src/debug/index.js";

// A synchronous dispatch inside an event handler is refused with the BUSY verdict: the inner
// call does nothing and the outer transition completes. queueMicrotask keeps things ordered.

type Node = "a" | "b" | "c";
const chain = () =>
  new StateMachine<
    IState<Node>,
    Merge<IEvent<"go"> | IEvent<"next">>,
    IEvent<"out">
  >(
    {
      a: { go: [{ to: "b", emit: "out" }] },
      b: { next: [{ to: "c" }] },
    },
    { type: "a", context: undefined },
  );

describe("a dispatch from a listener", () => {
  it("answers BUSY and does nothing, while the outer transition completes", () => {
    const fsm = chain();
    let inner: Verdict | undefined;
    fsm.rx.on("out", () => {
      inner = fsm.dispatch("next");
    });

    expect(fsm.dispatch("go")).toBe(OK);
    expect(inner).toBe(BUSY);
    expect(fsm.state.type).toBe("b"); // the outer move stood; the inner one never happened
  });

  it("is safe when deferred with queueMicrotask", async () => {
    const fsm = chain();
    const past = history(fsm);
    fsm.rx.on("out", () => queueMicrotask(() => fsm.dispatch("next")));

    expect(fsm.dispatch("go")).toBe(OK);
    expect(fsm.state.type).toBe("b"); // the deferred move has not happened yet
    await Promise.resolve();
    expect(fsm.state.type).toBe("c");
    expect(past.states.map((s) => s.type)).toEqual(["a", "b", "c"]);
  });

  it("releases the lock when a listener throws — one bad listener is not fatal", () => {
    const fsm = chain();
    const off = fsm.rx.on("out", () => {
      throw new Error("listener blew up");
    });

    expect(() => fsm.dispatch("go")).toThrow("listener blew up");
    off();

    // Without the `finally` the flag would still be raised here and every later dispatch
    // would answer BUSY — a live machine bricked by an unrelated bug.
    expect(fsm.state.type).toBe("b");
    expect(fsm.dispatch("next")).toBe(OK);
    expect(fsm.state.type).toBe("c");
  });
});

describe("a dispatch from an operation of the rule itself", () => {
  type Node = "a" | "b" | "c";
  type Ctx = { n: number };
  type Σ = Merge<IEvent<"go"> | IEvent<"other">>;
  type Λ = IEvent<"out", Ctx>;

  /** The lock covers the whole transition, so `with` is as much inside it as a listener is. */
  const nesting = (slot: "when" | "with" | "by") => {
    let inner: Verdict | undefined;
    const fsm: StateMachine<IState<Node, Ctx>, Σ, Λ> = new StateMachine<
      IState<Node, Ctx>,
      Σ,
      Λ
    >(
      {
        a: {
          go: [
            {
              when:
                slot === "when"
                  ? () => ((inner = fsm.dispatch("other")), true)
                  : undefined,
              to:
                slot === "with"
                  ? ([
                      "b",
                      (c) => ((inner = fsm.dispatch("other")), { n: c.n + 1 }),
                    ] as const)
                  : "b",
              emit: [
                "out",
                slot === "by"
                  ? (c) => ((inner = fsm.dispatch("other")), c)
                  : (c) => c,
              ] as const,
            },
          ],
          other: [{ to: "c" }],
        },
      },
      { type: "a", context: { n: 0 } },
    );
    return { fsm, inner: () => inner };
  };

  it.each(["when", "with", "by"] as const)(
    "refuses a nested dispatch from `%s` with BUSY; the outer transition completes",
    (slot) => {
      const { fsm, inner } = nesting(slot);
      expect(fsm.dispatch("go")).toBe(OK);
      expect(inner()).toBe(BUSY);
      // The inner move to 'c' never happened: the outer transition to 'b' stood.
      expect(fsm.state.type).toBe("b");
    },
  );

  it("still answers `can` from inside a handler — a question moves nothing", () => {
    const fsm = chain();
    let answer: boolean | undefined;
    fsm.rx.on("out", () => {
      answer = fsm.can("next").isOk();
    });
    fsm.dispatch("go");
    expect(answer).toBe(true);
  });
});
