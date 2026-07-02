import { ComposeParserError } from "./ComposeParserError.js";

/**
 * Thrown when a parsed manifest fails platform schema validation.
 */
export class ManifestValidationError extends ComposeParserError {
    /**
     * Creates a manifest validation error.
     *
     * @param details Schema validation details (for example Zod issues)
     */
    constructor(details: unknown) {
        super(
            "MANIFEST_VALIDATION_FAILED",
            "Manifest validation failed.",
            400,
            details
        );
    }
}
