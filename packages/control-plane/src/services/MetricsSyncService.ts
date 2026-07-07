import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ControlPlaneStore } from "../database/ControlPlaneStore";
import type { LeaderElection } from "./LeaderElection";
import { Logger } from "../Logger";
const log_metrics_sync = Logger.create("metrics-sync");


const DEFAULT_SYNC_INTERVAL_MS = 30_000;
const DEFAULT_FILE_SD_DIR = "/var/lib/naulite/prometheus/file_sd";
const TARGETS_FILE_NAME = "naulite_targets.json";

/**
 * Prometheus file_sd target group entry.
 */
export interface PrometheusFileSdTargetGroup {
    targets: string[];
    labels: Record<string, string>;
}

/**
 * Options for {@link MetricsSyncService}.
 */
export interface MetricsSyncServiceOptions {
    syncIntervalMs?: number;
    fileSdDir?: string;
    resolveControlPlaneUrls?: () => string[];
    isEnabled?: () => boolean;
}

/**
 * Leader-only service that writes Prometheus file_sd scrape targets from cluster state.
 */
export class MetricsSyncService {
    private intervalHandle: NodeJS.Timeout | null = null;
    private readonly syncIntervalMs: number;
    private readonly fileSdDir: string;
    private readonly resolveControlPlaneUrls: () => string[];
    private readonly isEnabled: () => boolean;

    /**
     * Creates a metrics sync service.
     *
     * @param store Control plane persistence layer
     * @param leaderElection Leader election service
     * @param options Optional sync configuration overrides
     */
    constructor(
        private readonly store: ControlPlaneStore,
        private readonly leaderElection: LeaderElection,
        options: MetricsSyncServiceOptions = {}
    ) {
        this.syncIntervalMs = options.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
        this.fileSdDir = options.fileSdDir ?? MetricsSyncService.resolveFileSdDir();
        this.resolveControlPlaneUrls = options.resolveControlPlaneUrls ?? MetricsSyncService.resolveControlPlaneUrls;
        this.isEnabled = options.isEnabled ?? MetricsSyncService.resolveEnabled;
    }

    /**
     * Starts periodic scrape target synchronization.
     *
     * @returns Nothing.
     */
    start(): void {
        if (this.intervalHandle || !this.isEnabled()) {
            return;
        }

        this.intervalHandle = setInterval(() => {
            void this.syncIfLeader().catch((err) => {
                log_metrics_sync.error("sync failed: %O", err);
            });
        }, this.syncIntervalMs);

        void this.syncIfLeader().catch((err) => {
            log_metrics_sync.error("initial sync failed: %O", err);
        });
    }

    /**
     * Stops periodic scrape target synchronization.
     *
     * @returns Nothing.
     */
    stop(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
    }

    /**
     * Writes scrape targets when this instance is the elected leader.
     *
     * @returns Nothing.
     */
    async syncIfLeader(): Promise<void> {
        if (!this.isEnabled() || !this.leaderElection.isLeader()) {
            return;
        }

        const targets = await this.buildTargetGroups();
        await this.writeTargetsFile(targets);

        log_metrics_sync.debug("wrote targets groups=%d dir=%s",
            targets.length,
            this.fileSdDir
        );
    }

    /**
     * Builds Prometheus file_sd target groups from cluster nodes and control plane peers.
     *
     * @returns Prometheus file_sd target groups
     */
    async buildTargetGroups(): Promise<PrometheusFileSdTargetGroup[]> {
        const groups: PrometheusFileSdTargetGroup[] = [];
        const nodes = await this.store.listNodes();

        for (const node of nodes) {
            if (node.status !== "online" || !node.agentUrl) {
                continue;
            }

            const target = MetricsSyncService.toScrapeTarget(node.agentUrl);

            if (!target) {
                continue;
            }

            groups.push({
                targets: [target],
                labels: {
                    job: "naulite-agent",
                    node_id: node.id,
                    hostname: node.hostname
                }
            });
        }

        for (const cpUrl of this.resolveControlPlaneUrls()) {
            const target = MetricsSyncService.toScrapeTarget(cpUrl);

            if (!target) {
                continue;
            }

            groups.push({
                targets: [target],
                labels: {
                    job: "naulite-control-plane",
                    cp_instance_id: MetricsSyncService.extractCpInstanceId(cpUrl)
                }
            });
        }

        return groups;
    }

    /**
     * Resolves whether metrics sync is enabled from environment.
     *
     * @returns Whether metrics sync should run
     */
    static resolveEnabled(): boolean {
        const raw = process.env.NAULITE_METRICS_SYNC_ENABLED ?? "true";
        return raw.trim().toLowerCase() !== "false";
    }

    /**
     * Resolves the file_sd directory from environment.
     *
     * @returns Writable file_sd directory path
     */
    static resolveFileSdDir(): string {
        return process.env.NAULITE_PROMETHEUS_FILE_SD_DIR ?? DEFAULT_FILE_SD_DIR;
    }

    /**
     * Resolves control plane metric scrape URLs from environment.
     *
     * @returns Control plane base URLs for metrics scraping
     */
    static resolveControlPlaneUrls(): string[] {
        const urls = new Set<string>();
        const selfPort = process.env.PORT ?? "8080";
        const selfHost = process.env.HOST ?? "0.0.0.0";

        if (selfHost !== "0.0.0.0") {
            urls.add(`http://${selfHost}:${selfPort}`);
        }

        urls.add(`http://127.0.0.1:${selfPort}`);
        urls.add(`http://localhost:${selfPort}`);

        const peerUrls = process.env.CP_PEER_URLS ?? "";

        for (const entry of peerUrls.split(/[,\s]+/)) {
            const trimmed = entry.trim();

            if (trimmed.length > 0) {
                urls.add(trimmed.replace(/\/+$/, ""));
            }
        }

        return [...urls];
    }

    /**
     * Converts a base URL into a Prometheus scrape target host:port string.
     *
     * @param baseUrl Agent or control plane base URL
     * @returns host:port target or null when invalid
     */
    static toScrapeTarget(baseUrl: string): string | null {
        try {
            const parsed = new URL(baseUrl);
            const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
            return `${parsed.hostname}:${port}`;
        } catch {
            return null;
        }
    }

    /**
     * Extracts a control plane instance id label from a scrape URL.
     *
     * @param baseUrl Control plane base URL
     * @returns Control plane instance id label
     */
    private static extractCpInstanceId(baseUrl: string): string {
        try {
            const parsed = new URL(baseUrl);
            return parsed.hostname;
        } catch {
            return "control-plane";
        }
    }

    /**
     * Writes the platform scrape targets file for Prometheus file_sd.
     *
     * @param targets Prometheus file_sd target groups
     * @returns Nothing.
     */
    private async writeTargetsFile(targets: PrometheusFileSdTargetGroup[]): Promise<void> {
        const outputPath = join(this.fileSdDir, TARGETS_FILE_NAME);
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, `${JSON.stringify(targets, null, 2)}\n`, "utf8");
    }
}

/**
 * Creates a metrics sync service.
 *
 * @param store Control plane persistence layer
 * @param leaderElection Leader election service
 * @param options Optional sync configuration overrides
 * @returns Configured metrics sync service
 */
export function createMetricsSyncService(
    store: ControlPlaneStore,
    leaderElection: LeaderElection,
    options?: MetricsSyncServiceOptions
): MetricsSyncService {
    return new MetricsSyncService(store, leaderElection, options);
}
