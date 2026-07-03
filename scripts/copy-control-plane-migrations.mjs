import { cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const controlPlaneRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "control-plane");

await cp(
    join(controlPlaneRoot, "src/database/migrations"),
    join(controlPlaneRoot, "dist/database/migrations"),
    { recursive: true }
);
