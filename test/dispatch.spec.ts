import { describe, it, expect, jest } from "@jest/globals";
import { UNHANDLED, OK } from "../src/core/index.js";
import { player } from "./core.spec.js";

describe("dispatch — the machine as a process", () => {
  it("moves, sends on the channel, and reports whether it fired", () => {
    const fsm = player();
    const started = jest.fn();
    fsm.rx.on("started", started);

    expect(fsm.dispatch("load")).toBe(OK);
    expect(fsm.dispatch("loaded")).toBe(OK);
    expect(fsm.dispatch("play")).toBe(OK);
    expect(fsm.state.type).toBe("playing");
    expect(started).toHaveBeenCalledTimes(1);
  });

  it("hands the output payload to the subscriber", () => {
    const fsm = player();
    const finished = jest.fn();
    fsm.rx.on("finished", finished);

    fsm.dispatch("load");
    fsm.dispatch("loaded");
    fsm.dispatch("play");
    fsm.dispatch("tick", { dt: 4 });
    fsm.dispatch("end");

    expect(finished).toHaveBeenCalledWith({ at: 4 });
  });

  it("names the reason and changes nothing when the event is not accepted", () => {
    const fsm = player();
    expect(fsm.dispatch("tick", { dt: 1 })).toBe(UNHANDLED);
    expect(fsm.state.type).toBe("idle");
    expect(fsm.state.context).toEqual({ t: 0 });
  });

  it("leaves everything alone when an event arrives at a state without a cell for it", () => {
    const fsm = player();
    fsm.dispatch("load"); // idle → loading
    expect(fsm.dispatch("play")).toBe(UNHANDLED); // no cell at 'loading'
    expect(fsm.state.type).toBe("loading");
  });

  it("restores a configuration without sending anything", () => {
    const fsm = player();
    const started = jest.fn();
    fsm.rx.on("started", started);
    fsm.restore({ type: "playing", context: { t: 12 } });
    expect(fsm.state.type).toBe("playing");
    expect(fsm.state.context).toEqual({ t: 12 });
    expect(started).not.toHaveBeenCalled();
  });

  it("runs with no channel at all until someone subscribes", () => {
    const fsm = player();
    expect(fsm.dispatch("load")).toBe(OK); // nothing touched `rx`, nothing to send to
    expect(fsm.state.type).toBe("loading");
  });

  it("is the only thing that moves the machine — asking does not", () => {
    const fsm = player();
    const started = jest.fn();
    fsm.rx.on("started", started);
    expect(fsm.can("load")).toBe(OK);
    expect(fsm.state.type).toBe("idle");
    expect(fsm.state.context).toEqual({ t: 0 });
    expect(started).not.toHaveBeenCalled();
  });
});
