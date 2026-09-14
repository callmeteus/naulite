import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Pinned Zig version helpers for agent and CLI builds.
 */
export const ZigToolchain = {
    /**
     * Reads `ZIG_VERSION` from an `infra/zig-toolchain.env` file body.
     *
     * @param contents Env file contents
     * @returns Pinned version, or `null` when the key is missing
     */
    parsePinnedVersion(contents) {
        if (typeof contents !== "string") {
            return null;
        }

        const match = /^ZIG_VERSION=(.+)$/m.exec(contents);

        if (!match) {
            return null;
        }

        const version = match[1].trim();

        if (!version) {
            return null;
        }

        return version;
    },

    /**
     * Parses `zig version` stdout into a version string.
     *
     * @param stdout Command output
     * @returns Installed version, or an empty string when missing
     */
    parseInstalledVersion(stdout) {
        if (typeof stdout !== "string") {
            return "";
        }

        const firstLine = stdout.trim().split(/\r?\n/)[0];

        return firstLine?.trim() ?? "";
    },

    /**
     * Returns whether the installed Zig version matches the pinned toolchain.
     *
     * @param installed Version from `zig version`
     * @param pinned Version from `infra/zig-toolchain.env`
     * @returns `true` when both are non-empty and equal
     */
    isCompatible(installed, pinned) {
        if (!installed || !pinned) {
            return false;
        }

        return installed === pinned;
    },

    /**
     * Loads the pinned Zig version from the repository env file.
     *
     * @param root Repository root
     * @returns Pinned version, or `null` when missing
     */
    loadPinnedVersion(root = repoRoot) {
        const envPath = path.join(root, "infra", "zig-toolchain.env");
        const contents = readFileSync(envPath, "utf8");

        return ZigToolchain.parsePinnedVersion(contents);
    },

    /**
     * Reads the Zig version currently on PATH.
     *
     * @returns Installed version, or an empty string when `zig` fails
     */
    readInstalledVersion() {
        const result = spawnSync("zig", ["version"], {
            encoding: "utf8"
        });

        return ZigToolchain.parseInstalledVersion(`${result.stdout ?? ""}${result.stderr ?? ""}`);
    }
};
