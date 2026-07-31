/**
 * Runs a host Prometheus binary for local dev when Docker is unavailable.
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const PROMETHEUS_VERSION = "3.12.0";

/**
 * Resolves the Prometheus release archive for the current platform.
 *
 * @param version Prometheus release version
 * @returns Archive metadata or null when unsupported
 */
function resolvePlatformArchive(version) {
    const { platform, arch } = process;

    if (platform === "win32") {
        const suffix = arch === "arm64" ? "windows-arm64.zip" : "windows-amd64.zip";

        return {
            archiveName: `prometheus-${version}.${suffix}`,
            extractDirName: `prometheus-${version}.${suffix.replace(".zip", "")}`,
            format: "zip"
        };
    }

    if (platform === "darwin") {
        const suffix = arch === "arm64" ? "darwin-arm64.tar.gz" : "darwin-amd64.tar.gz";

        return {
            archiveName: `prometheus-${version}.${suffix}`,
            extractDirName: `prometheus-${version}.${suffix.replace(".tar.gz", "")}`,
            format: "tar"
        };
    }

    if (platform === "linux") {
        const suffix = arch === "arm64" ? "linux-arm64.tar.gz" : "linux-amd64.tar.gz";

        return {
            archiveName: `prometheus-${version}.${suffix}`,
            extractDirName: `prometheus-${version}.${suffix.replace(".tar.gz", "")}`,
            format: "tar"
        };
    }

    return null;
}

/**
 * Returns whether a file exists.
 *
 * @param filePath Absolute file path
 * @returns `true` when the file exists
 */
async function fileExists(filePath) {
    try {
        await access(filePath);

        return true;
    } catch {
        return false;
    }
}

/**
 * Downloads a remote file to disk.
 *
 * @param url Download URL
 * @param destinationPath Output file path
 * @returns Nothing.
 */
async function downloadFile(url, destinationPath) {
    const response = await fetch(url);

    if (!response.ok || !response.body) {
        throw new Error(`Download failed with status ${response.status} for ${url}`);
    }

    await pipeline(Readable.fromWeb(response.body), createWriteStream(destinationPath));
}

/**
 * Extracts a Prometheus release archive.
 *
 * @param archivePath Downloaded archive path
 * @param destinationDir Extraction directory
 * @param format Archive format (`zip` or `tar`)
 * @returns Nothing.
 */
function extractArchive(archivePath, destinationDir, format) {
    if (format === "zip") {
        const command = `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destinationDir.replace(/'/g, "''")}' -Force`;
        const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
            stdio: "inherit"
        });

        if (result.status !== 0) {
            throw new Error(`Failed to extract ${archivePath}`);
        }

        return;
    }

    const result = spawnSync("tar", ["-xzf", archivePath, "-C", destinationDir], {
        stdio: "inherit"
    });

    if (result.status !== 0) {
        throw new Error(`Failed to extract ${archivePath}`);
    }
}

/**
 * Ensures the Prometheus binary is present in the local cache.
 *
 * @param repoRoot Repository root directory
 * @returns Absolute path to the Prometheus binary
 */
async function ensurePrometheusBinary(repoRoot) {
    const archive = resolvePlatformArchive(PROMETHEUS_VERSION);

    if (!archive) {
        throw new Error(`Host Prometheus is not supported on ${process.platform}/${process.arch}.`);
    }

    const cacheRoot = path.join(repoRoot, ".cache", "prometheus", PROMETHEUS_VERSION);
    const binaryName = process.platform === "win32" ? "prometheus.exe" : "prometheus";
    const binaryPath = path.join(cacheRoot, archive.extractDirName, binaryName);

    if (await fileExists(binaryPath)) {
        return binaryPath;
    }

    await mkdir(cacheRoot, { recursive: true });

    const archivePath = path.join(cacheRoot, archive.archiveName);
    const downloadUrl = `https://github.com/prometheus/prometheus/releases/download/v${PROMETHEUS_VERSION}/${archive.archiveName}`;

    console.log(`[dev-prometheus] downloading Prometheus ${PROMETHEUS_VERSION} (${archive.archiveName})...`);

    if (!await fileExists(archivePath)) {
        await downloadFile(downloadUrl, archivePath);
    }

    extractArchive(archivePath, cacheRoot, archive.format);

    if (!await fileExists(binaryPath)) {
        throw new Error(`Prometheus binary not found at ${binaryPath} after extraction.`);
    }

    return binaryPath;
}

/**
 * Writes a host-specific Prometheus config with absolute paths.
 *
 * @param repoRoot Repository root directory
 * @param controlPlanePort Control plane host port
 * @returns Absolute path to the generated config file
 */
async function writeHostConfig(repoRoot, controlPlanePort) {
    const fileSdGlob = path.join(repoRoot, "data", "prometheus", "file_sd", "*.json").replace(/\\/g, "/");
    const configPath = path.join(repoRoot, "data", "prometheus", "prometheus.dev.host.generated.yml");
    const config = [
        "global:",
        "  scrape_interval: 15s",
        "  evaluation_interval: 15s",
        "",
        "scrape_configs:",
        "  - job_name: naulite-control-plane",
        "    metrics_path: /metrics",
        "    static_configs:",
        `      - targets: ["127.0.0.1:${controlPlanePort}"]`,
        "        labels:",
        "          role: control-plane",
        "",
        "  - job_name: naulite",
        "    file_sd_configs:",
        "      - files:",
        `          - '${fileSdGlob}'`,
        "        refresh_interval: 30s",
        ""
    ].join("\n");

    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, config, "utf8");

    return configPath;
}

/**
 * Starts Prometheus as a host process for local development.
 *
 * @param options Startup options
 * @returns Child process handle
 */
export async function startHostPrometheus(options) {
    const {
        repoRoot,
        prometheusPort,
        controlPlanePort
    } = options;

    const binaryPath = await ensurePrometheusBinary(repoRoot);
    const configPath = await writeHostConfig(repoRoot, controlPlanePort);
    const storagePath = path.join(repoRoot, "data", "prometheus", "tsdb-host");

    await mkdir(storagePath, { recursive: true });
    await mkdir(path.join(repoRoot, "data", "prometheus", "file_sd"), { recursive: true });

    const child = spawn(binaryPath, [
        `--config.file=${configPath}`,
        `--storage.tsdb.path=${storagePath}`,
        "--web.enable-lifecycle",
        `--web.listen-address=127.0.0.1:${prometheusPort}`
    ], {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env
    });

    child.stdout.on("data", (chunk) => {
        const line = chunk.toString().trimEnd();

        if (line) {
            console.log(`[dev-prometheus] ${line}`);
        }
    });

    child.stderr.on("data", (chunk) => {
        const line = chunk.toString().trimEnd();

        if (line) {
            console.error(`[dev-prometheus] ${line}`);
        }
    });

    child.on("error", (error) => {
        console.error("[dev-prometheus] host process failed to start: %s", error.message);
    });

    return child;
}

/**
 * Returns whether host Prometheus is supported on the current platform.
 *
 * @returns `true` when a release archive exists for this OS/arch
 */
export function isHostPrometheusSupported() {
    return resolvePlatformArchive(PROMETHEUS_VERSION) !== null;
}
