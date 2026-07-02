import { ComposeParserError } from "./ComposeParserError";

/**
 * Thrown when the YAML parser cannot read the manifest content.
 */
export class YamlParseError extends ComposeParserError {
    /**
     * Creates a YAML parse error.
     *
     * @param cause Underlying parser failure
     */
    constructor(public readonly cause: unknown) {
        super("YAML_PARSE_ERROR", "Manifest YAML could not be parsed.");
    }
}
