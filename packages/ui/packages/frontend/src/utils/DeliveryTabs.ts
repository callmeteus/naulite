/**
 * Resolves the active delivery section tab from the current route path.
 *
 * @param path Current route path
 * @returns Active delivery tab id
 */
export function resolveDeliveryTab(path: string): "gitops" | "pipeline" {
    // Run list, run detail, deploy, and build all belong to the pipeline tab
    if (path.includes("/pipeline") || path === "/runs" || path.startsWith("/runs/")) {
        return "pipeline";
    }

    return "gitops";
}
