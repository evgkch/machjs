/**
 * The two-branch answer: a value, or the error that says why there is none. The shape is Rust's
 * `Result<T, E>` — `Ok(T) | Err(E)` — read through `isOk`/`isError` instead of `match`.
 *
 * A union of two classes, not one class with both fields: `if (r.isOk()) … else …` narrows the
 * else-branch only when the declared type is a union, and a single class cannot be subtracted
 * from. The methods are shared by a base that is not exported, so `Ok` and `Err` are the only two
 * shapes a caller ever holds.
 *
 * `toJSON` is what carries an `Error` through `JSON.stringify`, which drops its `message` — the
 * property is not enumerable and `Error` has no `toJSON` of its own.
 */
abstract class Branch<T, E extends Error> {
  abstract readonly result: T | undefined;
  abstract readonly error: E | undefined;

  /** Is this the `Ok` branch? Narrows `result` to `T`. */
  isOk(): this is Result.Ok<T, E> {
    return this.error === undefined;
  }

  /** Is this the `Err` branch? Narrows `error` to `E`. */
  isError(): this is Result.Err<T, E> {
    return this.error !== undefined;
  }

  /**
   * The value, or the error thrown. Kernel errors are shared frozen instances, so the stack of a
   * thrown one points at the module that built it, not at this call.
   */
  unwrap(): T {
    if (this.error !== undefined) throw this.error;
    return this.result as T;
  }

  /** The branch as data: the error by name and message, which is what tells two refusals apart. */
  toJSON():
    | { readonly result: T }
    | { readonly error: { readonly name: string; readonly message: string } } {
    const error = this.error;
    return error === undefined
      ? { result: this.result as T }
      : { error: { name: error.name, message: error.message } };
  }
}

export type Result<T, E extends Error = Error> =
  Result.Ok<T, E> | Result.Err<T, E>;

export namespace Result {
  /** The branch that carries a value. */
  export class Ok<T, E extends Error = Error> extends Branch<T, E> {
    readonly error = undefined;

    constructor(readonly result: T) {
      super();
    }
  }

  /** The branch that carries an error. */
  export class Err<T, E extends Error = Error> extends Branch<T, E> {
    readonly result = undefined;

    constructor(readonly error: E) {
      super();
    }
  }

  /** The `Ok` branch carrying `result`. */
  export const ok = <T, E extends Error = Error>(result: T): Ok<T, E> =>
    new Ok<T, E>(result);

  /** The `Err` branch carrying `error`. */
  export const error = <E extends Error, T = never>(error: E): Err<T, E> =>
    new Err<T, E>(error);
}
