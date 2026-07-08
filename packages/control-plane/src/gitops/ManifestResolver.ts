import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import type { SecretsService } from "../services/SecretsService";
import { ManifestMerge } from "./ManifestMerge";
import { ManifestInterpolator } from "./ManifestInterpolator";
import { GitSourceRepository } from "./GitSourceRepository";

/**
 * Resolves platform-specific compose directives (`extends`, `vars`, `apps`) into
 * a final Compose YAML that can be parsed by `ComposeParser`.
 *
 * This resolver supports:
 * - root-level `extends` (entire file) using deep-merge
 * - service-level `extends` (Compose semantics - maps merge, arrays concatenate, scalars override)
 * - `${VAR}` interpolation from `vars` (with coercion for numeric fields like `deploy.replicas`)
 */
export namespace ManifestResolver {
    type GitCredentials = GitSourceRepository.GitCredentials;

    export interface ResolveOptions {
        /**
         * Raw YAML of the manifest to resolve.
         */
        yaml: string;
        /**
         * Base directory used to resolve relative local paths.
         */
        baseDir: string;
        /**
         * Secret service used to resolve `credentials.from: secret`.
         */
        secrets: SecretsService;
        /**
         * Vars inherited from the catalog (app-of-apps).
         */
        inheritedVars?: Record<string, string>;
        /**
         * Optional cache shared across multiple resolves (e.g. app-of-apps).
         */
        cache?: GitSourceRepository.RepositoryCache;
    }

    export interface ResolveResult {
        /**
         * Fully resolved YAML suitable for `ComposeParser.parse`.
         */
        resolvedYaml: string;
        /**
         * Working directories (git checkouts / local directories) used as build context roots.
         */
        workDirs: string[];
        /**
         * Normalized git/local source identifiers referenced during resolution (auditing).
         */
        extendsSources: string[];
        /**
         * Final merged vars (`inheritedVars` overridden by local `vars`).
         */
        vars: Record<string, string>;
        /**
         * Present only when this manifest is an app-of-apps catalog.
         */
        apps?: Record<string, { path: string }>;
    }

    const META_KEYS = ["extends", "vars", "apps"];

    export async function resolve(options: ResolveOptions): Promise<ResolveResult> {
        const cache = options.cache ?? GitSourceRepository.createInMemoryCache();
        const rootDoc = parseYaml(options.yaml) as unknown;
        if (!rootDoc || typeof rootDoc !== "object" || Array.isArray(rootDoc)) {
            throw new Error("Manifest YAML deve conter um objeto na root.");
        }

        const parsedRoot = rootDoc as Record<string, unknown>;
        const apps = isPlainObject(parsedRoot.apps) ? (parsedRoot.apps as Record<string, { path: string }>) : undefined;

        const inheritedVars = options.inheritedVars ?? {};
        const localVars = isPlainObject(parsedRoot.vars) ? (parsedRoot.vars as Record<string, string>) : {};
        const vars = { ...inheritedVars, ...localVars };

        const { mergedRoot, rootWorkDirs, rootSources } = await applyRootExtends({
            doc: parsedRoot,
            baseDir: options.baseDir,
            secrets: options.secrets,
            cache
        });

        const serviceResolved = await applyServiceExtends({
            doc: mergedRoot,
            baseDir: options.baseDir,
            secrets: options.secrets,
            cache
        });

        const interpolated = ManifestInterpolator.interpolate(serviceResolved.doc, {
            vars,
            strict: true
        });

        const coerced = ManifestInterpolator.coerceNumericFields(interpolated);
        const stripped = stripMetaKeys(coerced);

        return {
            resolvedYaml: stringifyYaml(stripped),
            workDirs: [...new Set([...rootWorkDirs, ...serviceResolved.workDirs])],
            extendsSources: [...new Set([...rootSources, ...serviceResolved.sources])],
            vars,
            apps
        };
    }

    async function applyRootExtends(options: {
        doc: Record<string, unknown>;
        baseDir: string;
        secrets: SecretsService;
        cache: GitSourceRepository.RepositoryCache;
    }): Promise<{ mergedRoot: Record<string, unknown>; rootWorkDirs: string[]; rootSources: string[] }> {
        const extendsValue = options.doc.extends;
        if (!extendsValue) {
            return { mergedRoot: options.doc, rootWorkDirs: [], rootSources: [] };
        }

        const entries = normalizeRootExtends(extendsValue);
        let merged: Record<string, unknown> = {};
        const workDirs: string[] = [];
        const sources: string[] = [];

        for (const entry of entries) {
            const source = await GitSourceRepository.resolveComposeFile(options.secrets, {
                spec: entry.file,
                credentials: entry.credentials,
                baseDir: options.baseDir
            }, options.cache);

            workDirs.push(source.workDir);
            sources.push(source.sourceId);

            const baseDoc = parseYaml(source.yaml) as unknown;
            if (!baseDoc || typeof baseDoc !== "object" || Array.isArray(baseDoc)) {
                throw new Error(`Arquivo base inválido em extends: ${entry.file}`);
            }

            merged = ManifestMerge.deepMerge(merged, baseDoc) as Record<string, unknown>;
        }

        // Merge local on top of extended base
        merged = ManifestMerge.deepMerge(merged, options.doc) as Record<string, unknown>;
        return { mergedRoot: merged, rootWorkDirs: workDirs, rootSources: sources };
    }

    function normalizeRootExtends(value: unknown): Array<{ file: string; credentials?: GitCredentials }> {
        if (Array.isArray(value)) {
            return value.map((v) => {
                if (!isPlainObject(v) || typeof v.file !== "string") {
                    throw new Error("extends na root deve ser um objeto { file } ou uma lista disso.");
                }
                return { file: v.file, credentials: v.credentials as GitCredentials | undefined };
            });
        }

        if (isPlainObject(value) && typeof value.file === "string") {
            return [{ file: value.file, credentials: value.credentials as GitCredentials | undefined }];
        }

        throw new Error("extends na root deve ser um objeto { file } ou uma lista disso.");
    }

    async function applyServiceExtends(options: {
        doc: Record<string, unknown>;
        baseDir: string;
        secrets: SecretsService;
        cache: GitSourceRepository.RepositoryCache;
    }): Promise<{ doc: Record<string, unknown>; workDirs: string[]; sources: string[] }> {
        const services = options.doc.services;
        if (!isPlainObject(services)) {
            return { doc: options.doc, workDirs: [], sources: [] };
        }

        const outDoc: Record<string, unknown> = { ...options.doc };
        const outServices: Record<string, unknown> = { ...(services as Record<string, unknown>) };
        const workDirs: string[] = [];
        const sources: string[] = [];

        for (const [targetServiceName, rawService] of Object.entries(outServices)) {
            if (!isPlainObject(rawService)) {
                continue;
            }

            const service = rawService as Record<string, unknown>;
            const extendsSpec = service.extends;
            if (!extendsSpec) {
                continue;
            }

            const resolved = await resolveServiceBase(options.secrets, options.baseDir, options.cache, extendsSpec);
            workDirs.push(resolved.workDir);
            sources.push(resolved.sourceId);

            const baseDoc = parseYaml(resolved.yaml) as unknown;
            if (!isPlainObject(baseDoc)) {
                throw new Error(`Compose base inválido: ${resolved.sourceId}`);
            }

            const baseServices = (baseDoc as Record<string, unknown>).services;
            if (!isPlainObject(baseServices)) {
                throw new Error(`Compose base não tem services: ${resolved.sourceId}`);
            }

            const baseServiceName = readServiceExtendsService(extendsSpec);
            const baseService = (baseServices as Record<string, unknown>)[baseServiceName];
            if (!isPlainObject(baseService)) {
                throw new Error(`Service base não encontrado: ${baseServiceName} em ${resolved.sourceId}`);
            }

            const mergedService = mergeComposeService(baseService as Record<string, unknown>, stripExtends(service));
            outServices[targetServiceName] = mergedService;
        }

        outDoc.services = outServices;
        return { doc: outDoc, workDirs, sources };
    }

    async function resolveServiceBase(
        secrets: SecretsService,
        baseDir: string,
        cache: GitSourceRepository.RepositoryCache,
        extendsSpec: unknown
    ) {
        if (!isPlainObject(extendsSpec) || typeof extendsSpec.file !== "string" || typeof extendsSpec.service !== "string") {
            throw new Error("extends por serviço deve conter file e service.");
        }

        return GitSourceRepository.resolveComposeFile(secrets, {
            spec: extendsSpec.file,
            credentials: extendsSpec.credentials as GitCredentials | undefined,
            baseDir
        }, cache);
    }

    function mergeComposeService(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = { ...base };

        for (const [key, overrideValue] of Object.entries(override)) {
            const baseValue = out[key];

            if (Array.isArray(baseValue) && Array.isArray(overrideValue)) {
                out[key] = [...baseValue, ...overrideValue];
                continue;
            }

            if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
                out[key] = mergeComposeService(baseValue as Record<string, unknown>, overrideValue as Record<string, unknown>);
                continue;
            }

            out[key] = overrideValue;
        }

        return out;
    }

    function stripExtends(service: Record<string, unknown>): Record<string, unknown> {
        const out = { ...service };
        delete out.extends;
        return out;
    }

    function stripMetaKeys(doc: unknown): unknown {
        if (Array.isArray(doc)) {
            return doc.map(stripMetaKeys);
        }

        if (!doc || typeof doc !== "object") {
            return doc;
        }

        const input = doc as Record<string, unknown>;
        const out: Record<string, unknown> = {};

        for (const [k, v] of Object.entries(input)) {
            if (META_KEYS.includes(k)) {
                continue;
            }
            out[k] = stripMetaKeys(v);
        }

        return out;
    }

    function isPlainObject(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }

    function readServiceExtendsService(value: unknown): string {
        if (!isPlainObject(value) || typeof value.service !== "string" || value.service.trim() === "") {
            throw new Error("extends por serviço deve conter `service`.");
        }

        return value.service;
    }
}

