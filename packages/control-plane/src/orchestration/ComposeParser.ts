import { ManifestSchema, type Manifest, type ManifestService, type NetworkExposure } from "@platform/shared";
import { parse as parseYaml } from "yaml";
import { ZodError } from "zod";

import { InvalidManifestDocumentError } from "../errors/orchestration/compose/InvalidManifestDocumentError.js";
import { ManifestValidationError } from "../errors/orchestration/compose/ManifestValidationError.js";
import { YamlParseError } from "../errors/orchestration/compose/YamlParseError.js";

/**
 * Parsed compose document before manifest validation.
 */
interface RawComposeDocument {
    name?: string;
    services?: Record<string, Record<string, unknown>>;
    volumes?: Record<string, Record<string, unknown>>;
    networks?: Record<string, Record<string, unknown>>;
    registries?: Record<string, Record<string, unknown>>;
    defaults?: Record<string, unknown>;
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

        const manifestName = document.name ?? "default";
        const services: Record<string, ManifestService> = {};
        const rawServices = document.services ?? {};

        for (const [serviceName, rawService] of Object.entries(rawServices)) {
            services[serviceName] = ComposeParser.mapService(rawService);
        }

        const manifestCandidate = {
            name: manifestName,
            services,
            volumes: ComposeParser.mapVolumes(document.volumes ?? {}),
            networks: ComposeParser.mapNetworks(document.networks ?? {}),
            registries: ComposeParser.mapRegistries(document.registries ?? document.xPlatform?.registries as Record<string, Record<string, unknown>> ?? {}),
            defaults: ComposeParser.mapDefaults(document.defaults ?? document.xPlatform?.defaults as Record<string, unknown> | undefined)
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
        const platform = (rawService["x-platform"] ?? rawService.xPlatform ?? {}) as Record<string, unknown>;

        return {
            image: rawService.image as string | undefined,
            build: rawService.build as ManifestService["build"],
            command: rawService.command as ManifestService["command"],
            environment: rawService.environment as ManifestService["environment"],
            ports: rawService.ports as ManifestService["ports"],
            volumes: rawService.volumes as ManifestService["volumes"],
            networks: rawService.networks as ManifestService["networks"],
            dependsOn: rawService.dependsOn as ManifestService["dependsOn"],
            cluster: (platform.cluster ?? rawService.cluster) as ManifestService["cluster"],
            capabilities: (platform.capabilities ?? rawService.capabilities ?? []) as string[],
            buildOptions: (platform.buildOptions ?? rawService.buildOptions) as ManifestService["buildOptions"],
            ingress: (platform.ingress ?? rawService.ingress) as ManifestService["ingress"],
            logRotation: (platform.logRotation ?? rawService.logRotation) as ManifestService["logRotation"],
            secrets: (platform.secrets ?? rawService.secrets ?? []) as ManifestService["secrets"]
        };
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
            const platform = (rawVolume["x-platform"] ?? rawVolume.xPlatform ?? {}) as Record<string, unknown>;
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
            const platform = (rawNetwork["x-platform"] ?? rawNetwork.xPlatform ?? {}) as Record<string, unknown>;
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
            cluster: rawDefaults.cluster as Manifest["defaults"] extends { cluster?: infer C } ? C : never,
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
