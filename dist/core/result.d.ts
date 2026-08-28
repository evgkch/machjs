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
declare abstract class Branch<T, E extends Error> {
    abstract readonly result: T | undefined;
    abstract readonly error: E | undefined;
    /** Is this the `Ok` branch? Narrows `result` to `T`. */
    isOk(): this is Result.Ok<T, E>;
    /** Is this the `Err` branch? Narrows `error` to `E`. */
    isError(): this is Result.Err<T, E>;
    /**
     * The value, or the error thrown. Kernel errors are shared frozen instances, so the stack of a
     * thrown one points at the module that built it, not at this call.
     */
    unwrap(): T;
    /** The branch as data: the error by name and message, which is what tells two refusals apart. */
    toJSON(): {
        readonly result: T;
    } | {
        readonly error: {
            readonly name: string;
            readonly message: string;
        };
    };
}
export type Result<T, E extends Error = Error> = Result.Ok<T, E> | Result.Err<T, E>;
export declare namespace Result {
    /** The branch that carries a value. */
    class Ok<T, E extends Error = Error> extends Branch<T, E> {
        readonly result: T;
        readonly error: undefined;
        constructor(result: T);
    }
    /** The branch that carries an error. */
    class Err<T, E extends Error = Error> extends Branch<T, E> {
        readonly error: E;
        readonly result: undefined;
        constructor(error: E);
    }
    /** The `Ok` branch carrying `result`. */
    const ok: <T, E extends Error = Error>(result: T) => Ok<T, E>;
    /** The `Err` branch carrying `error`. */
    const error: <E extends Error, T = never>(error: E) => Err<T, E>;
}
export {};
