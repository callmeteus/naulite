import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cacheDir = join(tmpdir(), "platform-zig-cache");

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
