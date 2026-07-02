import { ComposeParserError } from "./ComposeParserError";

/**
 * Thrown when YAML content is not a top-level mapping object.
 */
export class InvalidManifestDocumentError extends ComposeParserError {
    /**
     * Creates an invalid manifest document error.
     */
    constructor() {
        super(
            "INVALID_MANIFEST_DOCUMENT",
            "Manifest YAML must contain a top-level object."
        );
    }
}
