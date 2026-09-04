import { describe, it, expect } from "@jest/globals";
import {
  Result,
  OK,
  UNHANDLED,
  REJECTED,
  TERMINAL,
  BUSY,
  UnhandledError,
} from "../src/core/index.js";
import type { Verdict } from "../src/core/index.js";

describe("Result — the two-branch answer", () => {
  it("builds the Ok branch from a value", () => {
    const r = Result.ok(42);

    expect(r.isOk()).toBe(true);
    expect(r.isError()).toBe(false);
    expect(r.result).toBe(42);
    expect(r.error).toBeUndefined();
  });

  it("builds the Err branch from an error", () => {
    const boom = new TypeError("boom");
    const r = Result.error(boom);

    expect(r.isError()).toBe(true);
    expect(r.isOk()).toBe(false);
    expect(r.error).toBe(boom);
    expect(r.result).toBeUndefined();
  });

  it("unwraps the value, and throws the error the Err branch holds", () => {
    const boom = new TypeError("boom");

    expect(Result.ok(42).unwrap()).toBe(42);
    expect(() => Result.error(boom).unwrap()).toThrow(boom);
  });

  it("serializes the error by name and message — a bare Error loses its message", () => {
    expect(JSON.parse(JSON.stringify(Result.ok(42)))).toEqual({ result: 42 });
    expect(JSON.parse(JSON.stringify(UNHANDLED))).toEqual({
      error: {
        name: "UnhandledError",
        message: "the event is unhandled in the current state",
      },
    });
    // `Error` has no `toJSON` and `message` is not enumerable: only `name` survives.
    expect(JSON.stringify(new UnhandledError())).toBe(
      '{"name":"UnhandledError"}',
    );
  });
});

describe("Verdict — the kernel's five answers", () => {
  it("is one instance each, so a verdict is comparable by identity", () => {
    const verdicts = [OK, UNHANDLED, REJECTED, TERMINAL, BUSY];

    expect(new Set(verdicts).size).toBe(5);
    expect(OK.result).toBe(true);
    for (const v of verdicts.slice(1)) expect(v.isError()).toBe(true);
  });

  it("names every refusal, so a translation switch is exhaustive", () => {
    // The `never` arm is the check: a name left out of the switch fails to compile.
    const why = (v: Verdict): string => {
      if (v.isOk()) return "mach/ok";
      switch (v.error.name) {
        case "UnhandledError":
          return "mach/unhandled";
        case "RejectedError":
          return "mach/rejected";
        case "TerminalError":
          return "mach/terminal";
        case "BusyError":
          return "mach/busy";
        default: {
          const unreachable: never = v.error;
          return unreachable;
        }
      }
    };

    expect([OK, UNHANDLED, REJECTED, TERMINAL, BUSY].map(why)).toEqual([
      "mach/ok",
      "mach/unhandled",
      "mach/rejected",
      "mach/terminal",
      "mach/busy",
    ]);
  });
});
