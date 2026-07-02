import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";

import type { FastifyInstance } from "fastify";

import { isRouteDefinition, type RouteHttpMethod } from "./DefineRoute";

const ROUTE_FILE_EXTENSIONS = [".ts", ".js"];
const HTTP_METHODS: RouteHttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/**
 * Discovers and registers file-based HTTP routes from named route files under src/routes.
 */
export namespace RouteFileLoader {
    /**
     * Registers every route module found under the control plane routes directory.
     *
     * @param app Fastify application instance
     * @returns Nothing.
     */
    export async function registerAll(app: FastifyInstance): Promise<void> {
        const routesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "routes");
        const routeFiles = await listRouteFiles(routesRoot);

        for (const routeFile of routeFiles) {
            const routePath = filePathToRoutePath(routesRoot, routeFile);
            const routeModule = await import(routeFileImportHref(routeFile));
            registerModuleRoutes(app, routePath, routeModule);
        }
    }

    /**
     * Builds an import href for a route module path.
     *
     * @param routeFile Absolute route file path
     * @returns Decoded file URL suitable for dynamic import
     */
    function routeFileImportHref(routeFile: string): string {
        return decodeURIComponent(pathToFileURL(routeFile).href);
    }

    /**
     * Converts a route file path to a Fastify URL pattern.
     *
     * @param routesRoot Absolute routes root directory
     * @param routeFile Absolute route file path
     * @returns Fastify route path
     */
    export function filePathToRoutePath(routesRoot: string, routeFile: string): string {
        const relativeFile = relative(routesRoot, routeFile).replace(/\.(ts|js)$/, "");

        if (relativeFile === "" || relativeFile === ".") {
            return "/";
        }

        const segments = relativeFile.split(sep).map((segment) => {
            if (segment.startsWith("[") && segment.endsWith("]")) {
                return `:${segment.slice(1, -1)}`;
            }

            return segment;
        });

        return `/${segments.join("/")}`;
    }

    /**
     * Returns whether a file is a route handler module.
     *
     * @param fileName File name
     * @returns Whether the file should be registered as a route
     */
    function isRouteFile(fileName: string): boolean {
        if (fileName === "index.ts" || fileName === "index.js") {
            return false;
        }

        return ROUTE_FILE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
    }

    /**
     * Lists all route handler files under a directory tree.
     *
     * @param directory Absolute directory to scan
     * @returns Absolute route file paths
     */
    async function listRouteFiles(directory: string): Promise<string[]> {
        const entries = await readdir(directory, { withFileTypes: true });
        const files: string[] = [];

        for (const entry of entries) {
            const entryPath = join(directory, entry.name);

            if (entry.isDirectory()) {
                files.push(...await listRouteFiles(entryPath));
                continue;
            }

            if (entry.isFile() && isRouteFile(entry.name)) {
                files.push(entryPath);
            }
        }

        return files.sort();
    }

    /**
     * Registers exported HTTP method handlers from a route module.
     *
     * @param app Fastify application instance
     * @param routePath Fastify route path
     * @param routeModule Imported route module
     * @returns Nothing.
     */
    function registerModuleRoutes(
        app: FastifyInstance,
        routePath: string,
        routeModule: Record<string, unknown>
    ): void {
        for (const method of HTTP_METHODS) {
            const definition = routeModule[method];

            if (!isRouteDefinition(definition)) {
                continue;
            }

            app.route({
                method,
                url: routePath,
                schema: definition.schema,
                preHandler: definition.preHandlers.length > 0 ? definition.preHandlers : undefined,
                handler: async (request, reply) => {
                    return definition.handler(request, reply);
                }
            });
        }
    }
}
