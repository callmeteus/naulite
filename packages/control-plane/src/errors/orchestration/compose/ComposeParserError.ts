/**
 * Base error for compose manifest parsing failures.
 */
export class ComposeParserError extends Error {
    /**
     * Creates a compose parser error.
     *
     * @param code Stable machine-readable error code
     * @param message Human-readable error message
     * @param statusCode Suggested HTTP status code for API responses
     * @param details Optional structured error details
     */
    constructor(
        public readonly code: string,
        message: string,
        public readonly statusCode: number = 400,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = new.target.name;
    }
}
