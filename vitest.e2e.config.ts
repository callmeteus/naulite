import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            "@platform/shared": path.resolve(rootDir, "packages/shared/src/index.ts"),
            "@platform/sdk": path.resolve(rootDir, "packages/sdk/src/index.ts"),
            "@platform/control-plane": path.resolve(rootDir, "packages/control-plane/src/index.ts"),
            "@platform/plugin-s3-storage-provider": path.resolve(rootDir, "packages/plugins/s3-storage-provider/src/index.ts")
        }
    },
    test: {
        include: ["tests/e2e/**/*.test.ts"],
        environment: "node",
        testTimeout: 180_000,
        hookTimeout: 300_000
    }
});
