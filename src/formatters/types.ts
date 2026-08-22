/** Types for the formatters (presentation) module. */
import type { Edge } from "../core/types.js";

/**
 * The contract: format some value (with options) into a string. Every export of this module has
 * this shape — pass any function of the same shape to swap in your own.
 *
 * `to*` takes a schema (`toRules`, `toTree`, `toMermaid`, `toDot`); `format*` takes a value
 * another module produced (`formatIssues`). A custom renderer wanting the library's own edge
 * label should call `edgeLabel` rather than rebuild it.
 *
 * The options parameter is spelled `Opts`, not `O` — `O` also reads as the output carrier
 * elsewhere in the library, spelled `Λ`, and one symbol meaning two things invites drift.
 *
 * Defaults to `never`, not `void`, so the bare `Formatter<T>` is a shape every formatter fits:
 *
 * ```ts
 * const renderers: Record<string, Formatter<unknown>> = { rules: toRules, tree: toTree };
 * ```
 *
 * `void` would reject that assignment, since `void` is not assignable to an options object;
 * `never` also leaves room to add options later without breaking a variable typed as the bare
 * shape.
 */
export type Formatter<T, Opts = never> = (value: T, options?: Opts) => string;

/** Options for the diagram-language renderers (`toMermaid`, `toDot`). */
export type RenderOptions<Q extends PropertyKey> = {
  /** Highlight this node as the current state (pass `fsm.state` for a live view). */
  current?: Q;
  /** Draw an initial-state marker pointing at this node. */
  start?: Q;
  /** Layout direction: top-to-bottom (default) or left-to-right. */
  direction?: "TB" | "LR";
  /** Say an edge some other way. Default `edgeLabel`; pass your own for another notation. */
  label?: (edge: Edge) => string;
};

/**
 * Options for the terminal tree (`toTree`).
 *
 * Deliberately not `RenderOptions & …`: a tree has no layout to direct and no arrow to hang a
 * start marker on, so inheriting `start` and `direction` would offer two options that do nothing.
 */
export type TextOptions<Q extends PropertyKey> = {
  /** Mark this node as the current one (pass `fsm.state` for a live view). */
  current?: Q;
  /** Wrap the current node in an ANSI inverse-video escape (terminal colour). Default false. */
  color?: boolean;
  /** Print only this node's slice — one lookup, the schema being state-major. */
  at?: Q;
  /** Say an edge some other way. Default `edgeLabel`; pass your own for another notation. */
  label?: (edge: Edge) => string;
};

/** Options for the analysis-report formatters. */
export type FormatOptions = {
  /** Colour severities with ANSI escapes. Default false. */
  color?: boolean;
};
