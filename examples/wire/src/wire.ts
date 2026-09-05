/**
 * The wire between the two machines — and the one thing on this page that is not a machine.
 *
 * It is the world: it takes a message, holds it for a while, and hands it over. What the reader
 * does to it is what a network does on a bad day — hold a message longer, deliver it twice, lose
 * it, or carry nothing at all. None of that is a state of the terminal or of the host, which is
 * exactly the point: neither machine has a rule about the wire, and both survive it.
 */

/** Which way a message is going. */
import type { Verdict } from "@evgkch/machjs";

export type Way = "up" | "down";

/** One message, while it is on the wire. */
export type Parcel = {
  readonly id: number;
  readonly way: Way;
  /** What to write on it. */
  readonly label: string;
  /** How long this one is taking, in milliseconds — read by the page to time the drawing. */
  readonly takes: number;
  /** A copy the wire made of an earlier message. */
  readonly copy: boolean;
};

/** What the reader may do to it. */
export type Weather = {
  /** Carrying nothing: everything handed over while this is on is lost. */
  cut: boolean;
  /** How long a crossing takes, in milliseconds. */
  takes: number;
  /** Deliver the next message twice, the copy a beat behind. */
  twice: boolean;
  /** Lose the next message. */
  lose: boolean;
};

/**
 * Handing a message to the machine at the far end. It answers with the machine's own verdict, so
 * the wire can write down what became of the delivery — a message that arrives and is refused is
 * not the same event as one that never arrives, and the journal tells them apart.
 */
export type Deliver = () => Verdict;

export type Wire = {
  readonly weather: Weather;
  /** Hand a message over. `arrive` is called once per delivery — twice, if the wire copied it. */
  send(way: Way, label: string, arrive: Deliver): void;
  /** What is on the wire right now, oldest first. */
  readonly flying: readonly Parcel[];
  /** Called whenever that list changed. */
  watch(on: () => void): () => void;
  /** Everything the wire ever did, newest first — including what it lost. */
  readonly log: readonly string[];
};

export function newWire(): Wire {
  const weather: Weather = {
    cut: false,
    takes: 900,
    twice: false,
    lose: false,
  };
  const flying: Parcel[] = [];
  const watchers = new Set<() => void>();
  const log: string[] = [];
  let next = 0;

  const told = () => {
    for (const on of watchers) on();
  };

  const note = (line: string) => {
    log.unshift(line);
    if (log.length > 40) log.pop();
  };

  /** What a machine that refused a delivery was refusing about. */
  const because = (v: Verdict): string =>
    v.error?.name === "UnhandledError"
      ? "no rule for it where the machine stands"
      : v.error?.name === "RejectedError"
        ? "no guard admitted it"
        : v.error?.name === "TerminalError"
          ? "the machine is finished"
          : "the machine was mid-transition";

  /** One crossing: on the wire for `takes`, then handed over — unless the wire is cut by then. */
  const fly = (way: Way, label: string, copy: boolean, arrive: Deliver) => {
    const parcel: Parcel = {
      id: ++next,
      way,
      label,
      takes: weather.takes,
      copy,
    };
    flying.push(parcel);
    told();
    setTimeout(() => {
      const at = flying.indexOf(parcel);
      if (at >= 0) flying.splice(at, 1);
      // Cut while it was in the air: the message is gone, and neither machine is told. A machine
      // that is waiting goes on waiting, which is the honest shape of the situation.
      if (weather.cut) note(`✕ ${label} — the wire was cut`);
      else {
        // Delivered. What the machine at the far end does with it is that machine's business,
        // and its verdict is the one place this page learns that a message changed nothing.
        const took = arrive();
        const said = `${label}${copy ? " (a copy)" : ""}`;
        note(took.isOk() ? `▸ ${said}` : `⊘ ${said} — ${because(took)}`);
      }
      told();
    }, parcel.takes);
  };

  return {
    weather,
    flying,
    log,
    watch(on) {
      watchers.add(on);
      return () => watchers.delete(on);
    },
    send(way, label, arrive) {
      if (weather.cut) {
        note(`✕ ${label} — the wire is cut`);
        told();
        return;
      }
      if (weather.lose) {
        weather.lose = false;
        note(`✕ ${label} — lost`);
        told();
        return;
      }
      fly(way, label, false, arrive);
      if (weather.twice) {
        weather.twice = false;
        // The copy leaves one crossing later, so it lands after the receiver has answered the
        // original and is listening again. Sent sooner it arrives mid-answer, where the receiver
        // has no rule for it at all — a true verdict, but not the one this page is about.
        setTimeout(() => fly(way, label, true, arrive), weather.takes);
      }
    },
  };
}
