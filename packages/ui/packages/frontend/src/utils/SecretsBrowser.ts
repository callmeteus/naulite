import type { Secret } from "@naulite/sdk";

export interface SecretFolderEntry {
    type: "folder";
    name: string;
    path: string[];
}

export interface SecretLeafEntry {
    type: "secret";
    name: string;
    fullName: string;
    scope: Secret["scope"];
    description?: string;
}

export type SecretBrowserEntry = SecretFolderEntry | SecretLeafEntry;

/**
 * Builds the slash-terminated prefix for a virtual folder path.
 *
 * @param path Folder path segments
 * @returns Prefix used to match nested secret names
 */
function buildPathPrefix(path: string[]): string {
    if (path.length === 0) {
        return "";
    }

    return `${path.join("/")}/`;
}

/**
 * Lists folder and secret entries visible at a virtual folder path.
 *
 * @param secrets Cluster secret metadata
 * @param currentPath Active folder path segments
 * @returns Sorted folder and secret browser entries
 */
export function listSecretBrowserEntries(secrets: Secret[], currentPath: string[]): SecretBrowserEntry[] {
    const prefix = buildPathPrefix(currentPath);
    const folders = new Set<string>();
    const leaves: SecretLeafEntry[] = [];

    for (const secret of secrets) {
        if (currentPath.length > 0 && !secret.name.startsWith(prefix)) {
            continue;
        }

        const remainder = currentPath.length === 0 ? secret.name : secret.name.slice(prefix.length);

        if (!remainder) {
            continue;
        }

        const slashIndex = remainder.indexOf("/");

        if (slashIndex === -1) {
            leaves.push({
                type: "secret",
                name: remainder,
                fullName: secret.name,
                scope: secret.scope,
                description: secret.description
            });

            continue;
        }

        folders.add(remainder.slice(0, slashIndex));
    }

    const folderEntries = [...folders]
        .sort((left, right) => left.localeCompare(right))
        .map((name) => ({
            type: "folder" as const,
            name,
            path: [...currentPath, name]
        }));

    const secretEntries = leaves.sort((left, right) => left.name.localeCompare(right.name));

    return [...folderEntries, ...secretEntries];
}
