import { rmSync } from "node:fs";
import { resolve } from "node:path";

const targetDir = resolve(process.cwd(), process.argv[2] ?? "dist");

rmSync(targetDir, { recursive: true, force: true });
