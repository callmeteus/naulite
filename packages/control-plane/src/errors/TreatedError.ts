/**
 * Extra fields returned in treated error HTTP responses.
 */
export type TreatedErrorData = Record<string, unknown>;

/**
 * Options passed to {@link TreatedError}.
 */
export type TreatedErrorOptions = TreatedErrorData & {
    statusCode: number;
};

/**
 * Domain error with an HTTP status code and optional response payload fields.
 */
export class TreatedError extends Error {
    public readonly statusCode: number;
    public readonly data: TreatedErrorData;

    /**
     * Creates a treated error.
     *
     * @param message Human-readable error message
     * @param options Response status code and extra body fields
     */
    constructor(message: string, options: TreatedErrorOptions) {
        super(message);
        this.name = new.target.name;
        const { statusCode, ...data } = options;
        this.statusCode = statusCode;
        this.data = data;
    }

    /**
     * Builds the JSON body for this error.
     *
     * @returns Response body object
     */
    toResponseBody(): Record<string, unknown> {
        return {
            message: this.message,
            ...this.data
        };
    }
}

/**
 * 400 Bad Request treated error.
 */
export class HTTP400Error extends TreatedError {
    /**
     * Creates a 400 treated error.
     *
     * @param message Human-readable error message
     * @param data Extra response body fields
     */
    constructor(message: string, data: TreatedErrorData = {}) {
        super(message, { ...data, statusCode: 400 });
    }
}

/**
 * 401 Unauthorized treated error.
 */
export class HTTP401Error extends TreatedError {
    /**
     * Creates a 401 treated error.
     *
     * @param message Human-readable error message
     * @param data Extra response body fields
     */
    constructor(message: string, data: TreatedErrorData = {}) {
        super(message, { ...data, statusCode: 401 });
    }
}

/**
 * 403 Forbidden treated error.
 */
export class HTTP403Error extends TreatedError {
    /**
     * Creates a 403 treated error.
     *
     * @param message Human-readable error message
     * @param data Extra response body fields
     */
    constructor(message: string, data: TreatedErrorData = {}) {
        super(message, { ...data, statusCode: 403 });
    }
}

/**
 * 404 Not Found treated error.
 */
export class HTTP404Error extends TreatedError {
    /**
     * Creates a 404 treated error.
     *
     * @param message Human-readable error message
     * @param data Extra response body fields
     */
    constructor(message: string, data: TreatedErrorData = {}) {
        super(message, { ...data, statusCode: 404 });
    }
}

/**
 * 502 Bad Gateway treated error.
 */
export class HTTP502Error extends TreatedError {
    /**
     * Creates a 502 treated error.
     *
     * @param message Human-readable error message
     * @param data Extra response body fields
     */
    constructor(message: string, data: TreatedErrorData = {}) {
        super(message, { ...data, statusCode: 502 });
    }
}

/**
 * 503 Service Unavailable treated error.
 */
export class HTTP503Error extends TreatedError {
    /**
     * Creates a 503 treated error.
     *
     * @param message Human-readable error message
     * @param data Extra response body fields
     */
    constructor(message: string, data: TreatedErrorData = {}) {
        super(message, { ...data, statusCode: 503 });
    }
}
