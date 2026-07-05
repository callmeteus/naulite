import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binaryName = process.platform === "win32" ? "naulite.exe" : "naulite";
const source = path.join(packageRoot, "zig-out", "bin", binaryName);
const targetDir = path.join(packageRoot, "native");
const target = path.join(targetDir, binaryName);

if (!existsSync(source)) {
    process.stderr.write(`[cli] native binary not found at ${source}; run zig build first\n`);
    process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
process.stdout.write(`[cli] copied native binary to ${target}\n`);
