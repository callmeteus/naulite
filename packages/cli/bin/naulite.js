#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDir, "..");
const binaryName = process.platform === "win32" ? "naulite.exe" : "naulite";

const nativeCandidates = [
    process.env.NAULITE_CLI_NATIVE,
    path.join(packageRoot, "native", binaryName),
    path.join(packageRoot, "zig-out", "bin", binaryName)
].filter((candidate) => Boolean(candidate));

for (const candidate of nativeCandidates) {
    if (!existsSync(candidate)) {
        continue;
    }

    const useInherit = Boolean(process.stdout.isTTY && process.stderr.isTTY);
    const result = spawnSync(candidate, process.argv.slice(2), {
        encoding: useInherit ? undefined : "utf8",
        stdio: useInherit ? "inherit" : ["inherit", "pipe", "pipe"]
    });

    if (!useInherit) {
        if (result.stdout) {
            process.stdout.write(result.stdout);
        }

        if (result.stderr) {
            process.stderr.write(result.stderr);
        }
    }

    process.exit(result.status ?? 1);
}

process.stderr.write(
    "[naulite] Native CLI binary not found. Run `zig build` in packages/cli and `yarn copy:native`, or set NAULITE_CLI_NATIVE.\n"
);
process.exit(1);
