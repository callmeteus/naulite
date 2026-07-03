/**
 * Error thrown when Infisical connection options are incomplete.
 */
export class InfisicalNotConfiguredError extends Error {
    /**
     * Creates an Infisical-not-configured error.
     *
     * @param message Optional detail message
     */
    constructor(message = "Infisical secret provider is not configured") {
        super(message);
        this.name = "InfisicalNotConfiguredError";
    }
}
