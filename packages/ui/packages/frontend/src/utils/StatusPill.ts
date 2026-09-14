export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

/**
 * Status values mapped to the success tone.
 */
const SUCCESS_STATUSES = new Set([
    "online",
    "healthy",
    "ok",
    "running",
    "succeeded",
    "completed",
    "registered",
    "bound",
    "available",
    "active"
]);

/**
 * Status values mapped to the warning tone.
 */
const WARNING_STATUSES = new Set([
    "registering",
    "pending",
    "deploying",
    "degraded",
    "draining",
    "pulling",
    "creating",
    "starting",
    "stopping",
    "removing",
    "deleting",
    "launching",
    "bootstrapping",
    "queued"
]);

/**
 * Status values mapped to the error tone.
 */
const ERROR_STATUSES = new Set([
    "offline",
    "unhealthy",
    "failed",
    "terminated",
    "cancelled",
    "disabled"
]);

/**
 * Status values mapped to the info tone.
 */
const INFO_STATUSES = new Set([
    "stopped",
    "unknown"
]);

/**
 * Resolves a semantic tone for a platform status value.
 *
 * @param status Raw status string from the API
 * @returns Visual tone for badge styling
 */
export function resolveStatusTone(status: string): StatusTone {
    const normalized = status.trim().toLowerCase();

    if (SUCCESS_STATUSES.has(normalized)) {
        return "success";
    }

    if (WARNING_STATUSES.has(normalized)) {
        return "warning";
    }

    if (ERROR_STATUSES.has(normalized)) {
        return "error";
    }

    if (INFO_STATUSES.has(normalized)) {
        return "info";
    }

    return "neutral";
}

/**
 * Maps a status tone to DaisyUI badge classes.
 *
 * @param tone Semantic status tone
 * @returns Tailwind/DaisyUI class list
 */
export function statusBadgeClass(tone: StatusTone): string {
    switch (tone) {
        case "success":
            return "badge-success";
        case "warning":
            return "badge-warning";
        case "error":
            return "badge-error";
        case "info":
            return "badge-info";
        default:
            return "badge-neutral";
    }
}
