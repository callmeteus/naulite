import { ComposeParserError } from "./ComposeParserError";
import { formatValidationDetails } from "@naulite/shared";

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
        const formatted = formatValidationDetails(details);

        super(
            "MANIFEST_VALIDATION_FAILED",
            formatted ? `Manifest validation failed: ${formatted}` : "Manifest validation failed.",
            400,
            details
        );
    }
}
