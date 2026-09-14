import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ZigToolchain } from "./zig-toolchain.mjs";

const pinnedVersion = ZigToolchain.loadPinnedVersion();
const installedVersion = ZigToolchain.readInstalledVersion();

if (!ZigToolchain.isCompatible(installedVersion, pinnedVersion)) {
    console.error(
        `error: pinned Zig version is ${pinnedVersion}, found ${installedVersion || "none"}`
    );
    process.exit(1);
}

const cacheDir = join(tmpdir(), "naulite-zig-cache");

mkdirSync(cacheDir, { recursive: true });

const env = {
    ...process.env,
    ZIG_GLOBAL_CACHE_DIR: cacheDir
};

const result = spawnSync("zig", ["build", ...process.argv.slice(2)], {
    stdio: "inherit",
    env,
    shell: process.platform === "win32"
});

process.exit(result.status ?? 1);
