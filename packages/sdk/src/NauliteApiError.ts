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

    /**
     * Returns the machine-readable error code when present in the response body.
     *
     * @returns Error code or undefined
     */
    get code(): string | undefined {
        if (typeof this.body !== "object" || this.body === null) {
            return undefined;
        }

        const record = this.body as Record<string, unknown>;

        if (typeof record.code === "string") {
            return record.code;
        }

        if (typeof record.error === "string") {
            return record.error;
        }

        return undefined;
    }

    /**
     * Returns optional validation or diagnostic details from the response body.
     *
     * @returns Details payload or undefined
     */
    get details(): unknown {
        if (typeof this.body !== "object" || this.body === null) {
            return undefined;
        }

        const record = this.body as Record<string, unknown>;

        return record.details;
    }
}
