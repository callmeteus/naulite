type ZodIssue = {
    path?: Array<string | number>;
    message?: string;
};

type FastifyValidationIssue = {
    instancePath?: string;
    message?: string;
};

const GENERIC_VALIDATION_MESSAGES = new Set([
    "validation failed.",
    "validation error",
    "manifest validation failed."
]);

/**
 * Formats a Zod-style path array into a dotted field path.
 *
 * @param path Issue path segments
 * @returns Dotted path or "manifest" when empty
 */
function formatIssuePath(path: Array<string | number> | undefined): string {
    if (!path || path.length === 0) {
        return "manifest";
    }

    return path.map(String).join(".");
}

/**
 * Formats Zod validation issues into a single operator-facing string.
 *
 * @param issues Zod issue list
 * @returns Formatted validation summary
 */
function formatZodIssues(issues: ZodIssue[]): string {
    return issues
        .map((issue) => `${formatIssuePath(issue.path)}: ${issue.message ?? "Invalid value."}`)
        .join("; ");
}

/**
 * Formats Fastify/AJV validation issues into a single operator-facing string.
 *
 * @param validation Fastify validation issue list
 * @param context Optional validation context such as "body"
 * @returns Formatted validation summary
 */
function formatFastifyValidation(validation: FastifyValidationIssue[], context?: string): string {
    return validation
        .map((entry) => {
            const path = entry.instancePath
                ? entry.instancePath.replace(/^\//, "").replace(/\//g, ".")
                : context ?? "request";

            return `${path}: ${entry.message ?? "Invalid value."}`;
        })
        .join("; ");
}

/**
 * Formats structured validation details from API error payloads.
 *
 * @param details Validation details from Zod, Fastify, or similar validators
 * @returns Human-readable validation summary or undefined
 */
export function formatValidationDetails(details: unknown): string | undefined {
    if (!details) {
        return undefined;
    }

    if (Array.isArray(details)) {
        if (details.length === 0) {
            return undefined;
        }

        const first = details[0];

        if (typeof first === "object" && first !== null && "path" in first) {
            return formatZodIssues(details as ZodIssue[]);
        }

        if (typeof first === "object" && first !== null && ("instancePath" in first || "schemaPath" in first)) {
            return formatFastifyValidation(details as FastifyValidationIssue[]);
        }
    }

    if (typeof details === "object" && details !== null) {
        const record = details as Record<string, unknown>;

        if (Array.isArray(record.issues)) {
            return formatZodIssues(record.issues as ZodIssue[]);
        }

        if (Array.isArray(record.validation)) {
            const context = typeof record.validationContext === "string"
                ? record.validationContext
                : undefined;

            return formatFastifyValidation(record.validation as FastifyValidationIssue[], context);
        }
    }

    return undefined;
}

/**
 * Enriches a generic API error message with field-level validation details.
 *
 * @param message Base API error message
 * @param details Optional structured validation details
 * @returns Operator-facing error message
 */
export function enrichApiErrorMessage(message: string, details?: unknown): string {
    const formatted = formatValidationDetails(details);

    if (!formatted) {
        return message;
    }

    const normalized = message.trim().toLowerCase();

    if (GENERIC_VALIDATION_MESSAGES.has(normalized) || normalized.includes("validation failed")) {
        return `Validation failed: ${formatted}`;
    }

    if (normalized.includes("validation")) {
        return `${message.replace(/\.$/, "")}: ${formatted}`;
    }

    return `${message} ${formatted}`;
}
