import type { NavItem } from "../config/navigation";

/**
 * Returns whether a sidebar item should appear selected for the current path.
 *
 * Exact `item.path` always matches. Optional `matchPrefixes` cover nested routes
 * such as `/runs/:id` while Entrega still links to `/delivery/gitops`.
 *
 * @param path - Current route path
 * @param item - Sidebar navigation item
 * @returns Whether the item is the active menu entry
 */
export function isNavItemActive(path: string, item: Pick<NavItem, "path" | "matchPrefixes">): boolean {
    // Exact destination of the link
    if (path === item.path) {
        return true;
    }

    const prefixes = item.matchPrefixes ?? [];

    // Nested delivery and run pages keep Entrega selected
    return prefixes.some((prefix) => {
        if (path === prefix) {
            return true;
        }

        return path.startsWith(`${prefix}/`);
    });
}
