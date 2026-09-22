import { parse as parseYaml } from "yaml";
import { ZodError } from "zod";
import {
    ManifestSchema,
    TaskSchema,
    type Manifest,
    type ManifestBuild,
    type ManifestService,
    type NetworkExposure,
    type Task
} from "@naulite/shared";

import { InvalidManifestDocumentError } from "../errors/orchestration/compose/InvalidManifestDocumentError";
import { ManifestValidationError } from "../errors/orchestration/compose/ManifestValidationError";
import { YamlParseError } from "../errors/orchestration/compose/YamlParseError";

/**
 * Parsed compose document before manifest validation.
 */
interface RawComposeDocument {
    name?: string;
    services?: Record<string, Record<string, unknown>>;
    tasks?: unknown[];
    vars?: Record<string, string>;
    apps?: Record<string, { path: string }>;
    volumes?: Record<string, Record<string, unknown>>;
    networks?: Record<string, Record<string, unknown>>;
    registries?: Record<string, Record<string, unknown>>;
    defaults?: Record<string, unknown>;
    pipeline?: Record<string, unknown>;
    xPlatform?: Record<string, unknown>;
}

/**
 * Parses Compose-compatible YAML manifests into validated platform manifests.
 */
export class ComposeParser {
    /**
     * Parses YAML manifest content into a validated platform manifest.
     * 
     * @param yamlContent Raw compose YAML content
     * @returns Validated platform manifest
     * @throws {YamlParseError} {@link YamlParseError}
     * @throws {InvalidManifestDocumentError} {@link InvalidManifestDocumentError}
     * @throws {ManifestValidationError} {@link ManifestValidationError}
     */
    parse(yamlContent: string): Manifest {
        let document: RawComposeDocument | null;

        try {
            document = parseYaml(yamlContent) as RawComposeDocument | null;
        } catch (err) {
            throw new YamlParseError(err);
        }

        if (!document || typeof document !== "object" || Array.isArray(document)) {
            throw new InvalidManifestDocumentError();
        }

        ComposeParser.rejectLegacyCluster(document);

        const manifestName = document.name ?? "default";
        const services: Record<string, ManifestService> = {};
        const rawServices = document.services ?? {};

        for (const [serviceName, rawService] of Object.entries(rawServices)) {
            if (!rawService || typeof rawService !== "object") {
                continue;
            }

            services[serviceName] = ComposeParser.mapService(rawService as Record<string, unknown>);
        }

        const manifestCandidate = {
            name: manifestName,
            services,
            tasks: ComposeParser.mapTasks(document.tasks ?? []),
            vars: document.vars ?? {},
            apps: document.apps,
            volumes: ComposeParser.mapVolumes(document.volumes ?? {}),
            networks: ComposeParser.mapNetworks(document.networks ?? {}),
            registries: ComposeParser.mapRegistries(document.registries ?? document.xPlatform?.registries as Record<string, Record<string, unknown>> ?? {}),
            defaults: ComposeParser.mapDefaults(document.defaults ?? document.xPlatform?.defaults as Record<string, unknown> | undefined),
            pipeline: ComposeParser.mapPipeline(document.pipeline ?? document.xPlatform?.pipeline)
        };

        try {
            return ManifestSchema.parse(manifestCandidate);
        } catch (err) {
            if (err instanceof ZodError) {
                throw new ManifestValidationError(err.issues);
            }

            throw err;
        }
    }

    /**
     * Maps a raw compose service entry into a manifest service.
     * 
     * @param rawService Raw compose service object
     * @returns Manifest service definition
     */
    private static mapService(rawService: Record<string, unknown>): ManifestService {
        const platform = (rawService["x-naulite"] ?? rawService.xNaulite ?? {}) as Record<string, unknown>;
        const placement = ComposeParser.mapPlacement(platform, rawService);
        const hostRuntime = ComposeParser.mapHostRuntime(platform);
        const scale = ComposeParser.mapScale(platform.scale ?? platform.deploy);

        return {
            image: hostRuntime ? undefined : (rawService.image as string | undefined),
            build: hostRuntime ? undefined : ComposeParser.mapBuild(rawService, platform),
            command: rawService.command as ManifestService["command"],
            environment: rawService.environment as ManifestService["environment"],
            ports: rawService.ports as ManifestService["ports"],
            volumes: rawService.volumes as ManifestService["volumes"],
            networks: rawService.networks as ManifestService["networks"],
            networkMode: ComposeParser.readNetworkMode(rawService),
            dependsOn: rawService.dependsOn as ManifestService["dependsOn"],
            placement,
            runtime: hostRuntime?.runtime,
            unit: hostRuntime?.unit,
            scale,
            capabilities: (platform.capabilities ?? rawService.capabilities ?? []) as string[],
            ingress: (platform.ingress ?? rawService.ingress) as ManifestService["ingress"],
            logRotation: (platform.logRotation ?? rawService.logRotation) as ManifestService["logRotation"],
            secrets: (platform.secrets ?? rawService.secrets ?? []) as ManifestService["secrets"],
            deploy: ComposeParser.mapDeploy(platform.deploy ?? rawService.deploy, scale),
            function: (platform.function ?? rawService.function) as ManifestService["function"]
        };
    }

    /**
     * Rejects deprecated cluster placement keys anywhere in the document.
     *
     * @param document Parsed YAML root object
     * @throws {ManifestValidationError} {@link ManifestValidationError}
     */
    private static rejectLegacyCluster(document: RawComposeDocument): void {
        const issues: { path: (string | number)[]; message: string }[] = [];

        const defaults = document.defaults ?? document.xPlatform?.defaults as Record<string, unknown> | undefined;

        if (defaults && typeof defaults === "object" && "cluster" in defaults) {
            issues.push({
                path: ["defaults", "cluster"],
                message: "cluster placement was removed; use x-naulite.target or x-naulite.targetGroup."
            });
        }

        const services = document.services ?? {};

        for (const [serviceName, rawService] of Object.entries(services)) {
            if (!rawService || typeof rawService !== "object") {
                continue;
            }

            const service = rawService as Record<string, unknown>;
            const platform = (service["x-naulite"] ?? service.xNaulite ?? {}) as Record<string, unknown>;

            if ("cluster" in service || "cluster" in platform) {
                issues.push({
                    path: ["services", serviceName, "cluster"],
                    message: "cluster placement was removed; use x-naulite.target or x-naulite.targetGroup."
                });
            }

            const build = service.build;

            if (build && typeof build === "object" && "cluster" in (build as Record<string, unknown>)) {
                issues.push({
                    path: ["services", serviceName, "build", "cluster"],
                    message: "cluster placement was removed from build; use target or targetGroup."
                });
            }
        }

        if (issues.length > 0) {
            throw new ManifestValidationError(issues.map((issue) => ({
                code: "custom",
                message: issue.message,
                path: issue.path
            })));
        }
    }

    /**
     * Reads Docker network mode from compose `network_mode`.
     *
     * @param rawService Raw compose service
     * @returns Network mode when declared
     */
    private static readNetworkMode(rawService: Record<string, unknown>): string | undefined {
        const value = rawService["network_mode"];

        if (typeof value !== "string" || value.trim() === "") {
            return undefined;
        }

        return value.trim();
    }

    /**
     * Maps x-naulite placement fields.
     *
     * @param platform Parsed x-naulite block
     * @param rawService Raw compose service
     * @returns Placement when target or targetGroup is set
     */
    private static mapPlacement(
        platform: Record<string, unknown>,
        rawService: Record<string, unknown>
    ): ManifestService["placement"] {
        const target = (platform.target ?? rawService.target) as string | undefined;
        const targetGroup = (platform.targetGroup ?? rawService.targetGroup) as string | undefined;

        if (!target && !targetGroup) {
            return undefined;
        }

        return { target, targetGroup };
    }

    /**
     * Maps host runtime fields from x-naulite.
     *
     * @param platform Parsed x-naulite block
     * @returns Host runtime descriptor when runtime is host
     */
    private static mapHostRuntime(platform: Record<string, unknown>): {
        runtime: "host";
        unit: NonNullable<ManifestService["unit"]>;
    } | undefined {
        if (platform.runtime !== "host") {
            return undefined;
        }

        const unit = platform.unit as ManifestService["unit"];

        if (!unit) {
            return undefined;
        }

        return {
            runtime: "host",
            unit
        };
    }

    /**
     * Maps scale hints from x-naulite.
     *
     * @param rawScale Raw scale or deploy block
     * @returns Scale block when present
     */
    private static mapScale(rawScale: unknown): ManifestService["scale"] {
        if (!rawScale || typeof rawScale !== "object") {
            return undefined;
        }

        const scale = rawScale as Record<string, unknown>;
        const replicas = scale.replicas !== undefined ? Number(scale.replicas) : undefined;
        const processes = scale.processes !== undefined ? Number(scale.processes) : undefined;

        if (replicas === undefined && processes === undefined) {
            return undefined;
        }

        return {
            replicas: replicas !== undefined && Number.isInteger(replicas) && replicas > 0 ? replicas : undefined,
            processes: processes !== undefined && Number.isInteger(processes) && processes > 0 ? processes : undefined
        };
    }

    /**
     * Maps playbook tasks from YAML.
     *
     * @param rawTasks Raw task list
     * @returns Validated tasks
     */
    private static mapTasks(rawTasks: unknown[]): Task[] {
        const tasks: Task[] = [];

        for (const rawTask of rawTasks) {
            if (!rawTask || typeof rawTask !== "object") {
                continue;
            }

            tasks.push(TaskSchema.parse(rawTask));
        }

        return tasks;
    }

    /**
     * Maps compose build block and legacy buildOptions into a unified build object.
     *
     * @param rawService Raw compose service object
     * @param platform Parsed x-naulite extension block
     * @returns Manifest build definition
     */
    private static mapBuild(
        rawService: Record<string, unknown>,
        platform: Record<string, unknown>
    ): ManifestService["build"] {
        const legacyOptions = (platform.buildOptions ?? rawService.buildOptions) as Record<string, unknown> | undefined;
        const rawBuild = rawService.build;

        if (typeof rawBuild === "string") {
            if (legacyOptions) {
                return {
                    context: rawBuild,
                    dockerfile: legacyOptions.dockerfile as string | undefined,
                    image: legacyOptions.image as string | undefined,
                    provider: (legacyOptions.provider as ManifestBuild["provider"]) ?? "docker",
                    target: legacyOptions.target as string | undefined,
                    targetGroup: legacyOptions.targetGroup as string | undefined
                };
            }

            return rawBuild;
        }

        if (rawBuild && typeof rawBuild === "object") {
            const buildObject = rawBuild as Record<string, unknown>;

            return {
                context: String(buildObject.context ?? "."),
                dockerfile: buildObject.dockerfile as string | undefined,
                image: buildObject.image as string | undefined,
                provider: (buildObject.provider as ManifestBuild["provider"])
                    ?? (legacyOptions?.provider as ManifestBuild["provider"])
                    ?? "docker",

                target: (buildObject.target as string | undefined)
                    ?? (legacyOptions?.target as string | undefined),
                targetGroup: (buildObject.targetGroup as string | undefined)
                    ?? (legacyOptions?.targetGroup as string | undefined)
            };
        }

        return undefined;
    }

    /**
     * Maps optional manifest-level pipeline notification overrides.
     *
     * @param rawPipeline Raw pipeline object from compose extensions
     * @returns Manifest pipeline block when present
     */
    private static mapPipeline(rawPipeline: unknown): Manifest["pipeline"] {
        if (!rawPipeline || typeof rawPipeline !== "object") {
            return undefined;
        }

        const pipeline = rawPipeline as Record<string, unknown>;
        const notifications = pipeline.notifications as Record<string, unknown> | undefined;

        if (!notifications) {
            return undefined;
        }

        const slack = notifications.slack as Record<string, unknown> | undefined;

        return {
            notifications: slack
                ? {
                    slack: {
                        enabled: slack.enabled !== false,
                        channel: typeof slack.channel === "string" ? slack.channel : undefined
                    }
                }
                : undefined
        };
    }

    /**
     * Maps deploy block from compose extensions.
     *
     * @param rawDeploy Raw deploy object
     * @returns Manifest deploy options when present
     */
    private static mapDeploy(
        rawDeploy: unknown,
        scale?: ManifestService["scale"]
    ): ManifestService["deploy"] {
        if (!rawDeploy || typeof rawDeploy !== "object") {
            if (scale?.replicas) {
                return { replicas: scale.replicas };
            }

            return undefined;
        }

        const deploy = rawDeploy as Record<string, unknown>;
        const replicas = Number(deploy.replicas ?? scale?.replicas ?? 1);

        if (!Number.isInteger(replicas) || replicas < 1) {
            return undefined;
        }

        return { replicas };
    }

    /**
     * Maps raw compose volume entries.
     * 
     * @param rawVolumes Raw compose volumes map
     * @returns Manifest volumes map
     */
    private static mapVolumes(rawVolumes: Record<string, Record<string, unknown>>) {
        const volumes: Manifest["volumes"] = {};

        for (const [volumeName, rawVolume] of Object.entries(rawVolumes)) {
            const platform = (rawVolume["x-naulite"] ?? rawVolume.xNaulite ?? {}) as Record<string, unknown>;
            volumes[volumeName] = {
                driver: rawVolume.driver as string | undefined,
                backup: (platform.backup ?? rawVolume.backup) as Manifest["volumes"][string]["backup"]
            };
        }

        return volumes;
    }

    /**
     * Maps raw compose network entries.
     * 
     * @param rawNetworks Raw compose networks map
     * @returns Manifest networks map
     */
    private static mapNetworks(rawNetworks: Record<string, Record<string, unknown>>) {
        const networks: Manifest["networks"] = {};

        for (const [networkName, rawNetwork] of Object.entries(rawNetworks)) {
            const platform = (rawNetwork["x-naulite"] ?? rawNetwork.xNaulite ?? {}) as Record<string, unknown>;
            networks[networkName] = {
                local: Boolean(platform.local ?? rawNetwork.local ?? false),
                driver: (rawNetwork.driver as string | undefined) ?? (platform.driver as string | undefined)
            };
        }

        return networks;
    }

    /**
     * Maps registry declarations from compose extensions.
     * 
     * @param rawRegistries Raw registry map
     * @returns Manifest registries map
     */
    private static mapRegistries(rawRegistries: Record<string, Record<string, unknown>>) {
        const registries: Manifest["registries"] = {};

        for (const [registryName, rawRegistry] of Object.entries(rawRegistries)) {
            registries[registryName] = {
                url: String(rawRegistry.url),
                default: Boolean(rawRegistry.default ?? false),
                credentialsSecret: rawRegistry.credentialsSecret as Manifest["registries"][string]["credentialsSecret"]
            };
        }

        return registries;
    }

    /**
     * Maps manifest defaults from compose extensions.
     * 
     * @param rawDefaults Raw defaults object
     * @returns Manifest defaults when present
     */
    private static mapDefaults(rawDefaults: Record<string, unknown> | undefined) {
        if (!rawDefaults) {
            return undefined;
        }

        return {
            logRotation: rawDefaults.logRotation as Manifest["defaults"] extends { logRotation?: infer L } ? L : never
        };
    }

    /**
     * Extracts internal NetBird exposure rules from a manifest.
     * 
     * @param manifest Validated manifest
     * @returns Exposure rules for internal ingress services
     */
    extractInternalExposures(manifest: Manifest): NetworkExposure[] {
        const exposures: NetworkExposure[] = [];

        for (const [serviceName, service] of Object.entries(manifest.services)) {
            if (!service.ingress || service.ingress.exposure !== "internal") {
                continue;
            }

            for (const pathRule of service.ingress.paths) {
                const networkName = service.networks?.[0] ?? "default";
                exposures.push({
                    serviceName,
                    port: pathRule.port,
                    protocol: pathRule.protocol === "tcp" ? "tcp" : "tcp",
                    networkName
                });
            }
        }

        return exposures;
    }
}
