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
     * Returns the Vue i18n key when the API returned one.
     *
     * @returns i18n key or undefined
     */
    get i18n(): string | undefined {
        if (typeof this.body !== "object" || this.body === null) {
            return undefined;
        }

        const record = this.body as Record<string, unknown>;

        return typeof record.i18n === "string" ? record.i18n : undefined;
    }

    /**
     * Returns interpolation params for the Vue i18n key when present.
     *
     * @returns Params object or undefined
     */
    get i18nParams(): Record<string, string> | undefined {
        if (typeof this.body !== "object" || this.body === null) {
            return undefined;
        }

        const record = this.body as Record<string, unknown>;
        const params = record.i18nParams;

        if (typeof params !== "object" || params === null) {
            return undefined;
        }

        const normalized: Record<string, string> = {};

        for (const [key, value] of Object.entries(params)) {
            if (typeof value === "string") {
                normalized[key] = value;
            }
        }

        return Object.keys(normalized).length > 0 ? normalized : undefined;
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

    /**
     * Returns the elected leader instance id when the API reports a follower redirect.
     *
     * @returns Leader instance id or undefined
     */
    get leaderId(): string | undefined {
        if (typeof this.body !== "object" || this.body === null) {
            return undefined;
        }

        const record = this.body as Record<string, unknown>;
        const leaderId = record.leaderId;

        return typeof leaderId === "string" ? leaderId : undefined;
    }
}
