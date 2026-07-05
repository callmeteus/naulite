/**
 * Error thrown when the control plane returns a non-success HTTP status.
 */
export class NauliteApiError extends Error {
    /**
     * Creates a platform API error.
     * 
     * @param status HTTP status code
     * @param message Error message from the API or transport layer
     * @param body Optional response body
     */
    constructor(
        public readonly status: number,
        message: string,
        public readonly body?: unknown
    ) {
        super(message);
        this.name = "NauliteApiError";
    }
}
