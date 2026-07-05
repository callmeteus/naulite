import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            "@naulite/shared": path.resolve(rootDir, "packages/shared/src/index.ts"),
            "@naulite/sdk": path.resolve(rootDir, "packages/sdk/src/index.ts"),
            "@naulite/control-plane": path.resolve(rootDir, "packages/control-plane/src/index.ts"),
            "@naulite/plugin-s3-storage-provider": path.resolve(rootDir, "packages/plugins/s3-storage-provider/src/index.ts")
        }
    },
    test: {
        include: ["tests/e2e/**/*.test.ts"],
        environment: "node",
        testTimeout: 600_000,
        hookTimeout: 600_000,
        fileParallelism: false
    }
});
