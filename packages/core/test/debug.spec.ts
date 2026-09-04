import { describe, it, expect, jest } from "@jest/globals";
import { log, rules, invariant, history } from "../src/debug/index.js";
import { player } from "./core.spec.js";

const run = player;
const ready = () => {
  const fsm = run();
  fsm.dispatch("load");
  fsm.dispatch("loaded");
  return fsm;
};

describe("log", () => {
  it("hands the sink the whole transition and nothing else", () => {
    const seen: unknown[][] = [];
    const fsm = ready();
    log(fsm, (...args) => seen.push(args));
    fsm.dispatch("play");

    expect(seen).toHaveLength(1);
    expect(seen[0]).toHaveLength(1); // the transition, unaccompanied
    expect(seen[0][0]).toMatchObject({
      input: { type: "play" },
      source: { type: "ready" },
      target: { type: "playing" },
      output: { type: "started" },
    });
  });

  it("formats by taking a wrapped sink, not by a mode of its own", () => {
    const lines: string[] = [];
    const fsm = ready();
    log(
      fsm,
      rules((line) => lines.push(line)),
    );

    fsm.dispatch("play");
    fsm.dispatch("tick", { dt: 2 });
    fsm.dispatch("end");

    expect(lines).toEqual([
      "FROM ready ON play TO playing EMIT started",
      "FROM playing ON tick TO playing",
      "FROM playing ON end TO ended EMIT finished",
    ]);
  });

  it("subsumes an output tap: the event type is a condition in the sink", () => {
    const seen: unknown[] = [];
    const fsm = ready();
    log(fsm, (t) => {
      if (t.output !== undefined) seen.push(t.output);
    });

    fsm.dispatch("play");
    fsm.dispatch("tick", { dt: 3 }); // silent — not seen
    fsm.dispatch("end");

    expect(seen).toEqual([
      { type: "started" },
      { type: "finished", payload: { at: 3 } },
    ]);
  });

  it("sees nothing when a dispatch fires nothing", () => {
    const sink = jest.fn();
    const fsm = run();
    log(fsm, sink);
    fsm.dispatch("tick", { dt: 1 });
    expect(sink).not.toHaveBeenCalled();
  });

  it("detaches", () => {
    const sink = jest.fn();
    const fsm = run();
    log(fsm, sink)();
    fsm.dispatch("load");
    expect(sink).not.toHaveBeenCalled();
  });
});

describe("rules", () => {
  it("takes nothing but the sink, so one formatter serves any machine", () => {
    const lines: string[] = [];
    const format = (line: string) => {
      lines.push(line);
    };

    const a = run();
    const b = ready();
    log(a, rules(format));
    log(b, rules(format));

    a.dispatch("load");
    b.dispatch("play");
    expect(lines).toEqual([
      "FROM idle ON load TO loading",
      "FROM ready ON play TO playing EMIT started",
    ]);
  });

  it("hands the wrapped sink the whole transition beside the line", () => {
    const seen: [string, unknown, unknown][] = [];
    const fsm = ready();
    log(
      fsm,
      rules((line, t) => seen.push([line, t.input, t.output])),
    );
    fsm.dispatch("play");
    expect(seen).toEqual([
      [
        "FROM ready ON play TO playing EMIT started",
        { type: "play" },
        { type: "started" },
      ],
    ]);
  });

  it("is what a plain `log(fsm)` runs", () => {
    const fsm = ready();
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      log(fsm);
      fsm.dispatch("play");
      expect(spy).toHaveBeenCalledWith(
        "FROM ready ON play TO playing EMIT started",
        expect.anything(),
      );
    } finally {
      spy.mockRestore();
    }
  });
});

describe("invariant", () => {
  it("throws on a violated invariant, naming the transition", () => {
    const fsm = ready();
    invariant(fsm, (context) => context.t >= 0);
    fsm.dispatch("play");
    expect(() => fsm.dispatch("tick", { dt: -5 })).toThrow(
      /FROM playing ON tick TO playing/,
    );
  });

  it("calls the handler instead of throwing when one is given", () => {
    const onViolation = jest.fn();
    const fsm = ready();
    invariant(fsm, (context) => context.t >= 0, onViolation);
    fsm.dispatch("play");
    fsm.dispatch("tick", { dt: -5 });
    expect(onViolation).toHaveBeenCalledTimes(1);
  });

  it("hands the handler the same line the default message would carry", () => {
    let line = "";
    const fsm = ready();
    invariant(
      fsm,
      (context) => context.t >= 0,
      (_t, l) => {
        line = l;
      },
    );
    fsm.dispatch("play");
    fsm.dispatch("tick", { dt: -5 });
    expect(line).toBe("FROM playing ON tick TO playing");
  });
});

describe("history", () => {
  it("records a state per fired transition and travels back and forth", () => {
    const fsm = run();
    const h = history(fsm);

    fsm.dispatch("load");
    fsm.dispatch("loaded");
    fsm.dispatch("play");
    expect(h.states.length).toBe(4);
    expect(h.canRedo).toBe(false);

    expect(h.undo()).toBe(true);
    expect(fsm.state.type).toBe("ready");
    expect(h.canRedo).toBe(true);
    expect(h.redo()).toBe(true);
    expect(fsm.state.type).toBe("playing");

    expect(h.jump(0)).toBe(true);
    expect(fsm.state.type).toBe("idle");
    expect(fsm.state.context).toEqual({ t: 0 });
    expect(h.jump(99)).toBe(false);
    expect(h.undo()).toBe(false);
  });

  it("truncates the redo future on a new dispatch", () => {
    const fsm = run();
    const h = history(fsm);
    fsm.dispatch("load");
    fsm.dispatch("loaded");
    h.undo();
    fsm.dispatch("loaded");
    expect(h.canRedo).toBe(false);
    expect(h.states.length).toBe(3);
  });

  it("caps the buffer, dropping the oldest", () => {
    const fsm = run();
    const h = history(fsm, { maxSize: 2 });
    fsm.dispatch("load");
    fsm.dispatch("loaded");
    expect(h.states.length).toBe(2);
    expect(h.states[0].type).toBe("loading");
  });

  it("stops recording when detached", () => {
    const fsm = run();
    const h = history(fsm);
    h.stop();
    fsm.dispatch("load");
    expect(h.states.length).toBe(1);
  });
});
