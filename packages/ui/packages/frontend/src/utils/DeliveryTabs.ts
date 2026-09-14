/**
 * Resolves the active delivery section tab from the current route path.
 *
 * @param path Current route path
 * @returns Active delivery tab id
 */
export function resolveDeliveryTab(path: string): "gitops" | "pipeline" {
    if (path.includes("/pipeline")) {
        return "pipeline";
    }

    return "gitops";
}
