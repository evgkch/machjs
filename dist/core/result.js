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
class Branch {
    /** Is this the `Ok` branch? Narrows `result` to `T`. */
    isOk() {
        return this.error === undefined;
    }
    /** Is this the `Err` branch? Narrows `error` to `E`. */
    isError() {
        return this.error !== undefined;
    }
    /**
     * The value, or the error thrown. Kernel errors are shared frozen instances, so the stack of a
     * thrown one points at the module that built it, not at this call.
     */
    unwrap() {
        if (this.error !== undefined)
            throw this.error;
        return this.result;
    }
    /** The branch as data: the error by name and message, which is what tells two refusals apart. */
    toJSON() {
        const error = this.error;
        return error === undefined
            ? { result: this.result }
            : { error: { name: error.name, message: error.message } };
    }
}
export var Result;
(function (Result) {
    /** The branch that carries a value. */
    class Ok extends Branch {
        result;
        error = undefined;
        constructor(result) {
            super();
            this.result = result;
        }
    }
    Result.Ok = Ok;
    /** The branch that carries an error. */
    class Err extends Branch {
        error;
        result = undefined;
        constructor(error) {
            super();
            this.error = error;
        }
    }
    Result.Err = Err;
    /** The `Ok` branch carrying `result`. */
    Result.ok = (result) => new Ok(result);
    /** The `Err` branch carrying `error`. */
    Result.error = (error) => new Err(error);
})(Result || (Result = {}));
