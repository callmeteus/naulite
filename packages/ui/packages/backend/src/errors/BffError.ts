/**
 * Structured BFF error returned to the admin UI for client-side i18n.
 */
export interface BffErrorResponse {
    i18n: string;
    i18nParams?: Record<string, string>;
    code?: string;
}

/**
 * Error thrown by the admin BFF with an i18n key for the frontend.
 */
export type BffError = Error & BffErrorResponse & {
    statusCode: number;
};

/**
 * Creates a Fastify-compatible error carrying an i18n key.
 *
 * @param statusCode HTTP status code
 * @param i18n Vue i18n key shared with the admin UI locales
 * @param options Optional machine code and interpolation params
 * @returns Error with BFF metadata
 */
export function createBffError(
    statusCode: number,
    i18n: string,
    options: {
        i18nParams?: Record<string, string>;
        code?: string;
    } = {}
): BffError {
    const error = new Error(i18n) as BffError;
    error.statusCode = statusCode;
    error.i18n = i18n;
    error.i18nParams = options.i18nParams;
    error.code = options.code;

    return error;
}

/**
 * Returns whether a thrown value is a structured BFF error.
 *
 * @param error Unknown thrown value
 * @returns True when the error includes an i18n key
 */
export function isBffError(error: unknown): error is BffError {
    return error instanceof Error
        && "i18n" in error
        && typeof (error as BffError).i18n === "string";
}

/**
 * Serializes a BFF error for JSON responses.
 *
 * @param error Structured BFF error
 * @returns Response body for the admin UI
 */
export function toBffErrorResponse(error: BffError): BffErrorResponse {
    return {
        i18n: error.i18n,
        i18nParams: error.i18nParams,
        code: error.code
    };
}
