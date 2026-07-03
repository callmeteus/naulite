import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            "@platform/shared": path.resolve(rootDir, "packages/shared/src/index.ts"),
            "@platform/sdk": path.resolve(rootDir, "packages/sdk/src/index.ts"),
            "@platform/gateway": path.resolve(rootDir, "packages/gateway/src/index.ts"),
            "@platform/control-plane": path.resolve(rootDir, "packages/control-plane/src/index.ts"),
            "@platform/plugin-s3-storage-provider": path.resolve(rootDir, "packages/plugins/s3-storage-provider/src/index.ts"),
            "@platform/plugin-infisical-secret-provider": path.resolve(rootDir, "packages/plugins/infisical-secret-provider/src/index.ts"),
            "@platform/plugin-aws-node-provisioner": path.resolve(rootDir, "packages/plugins/aws-node-provisioner/src/index.ts"),
            "@platform/builder-docker": path.resolve(rootDir, "packages/builders/docker/src/index.ts"),
            "@platform/runtime-docker": path.resolve(rootDir, "packages/runtimes/docker/src/index.ts"),
            "@platform/runtime-podman": path.resolve(rootDir, "packages/runtimes/podman/src/index.ts"),
            "@platform/runtime-containerd": path.resolve(rootDir, "packages/runtimes/containerd/src/index.ts")
        }
    },
    test: {
        include: ["tests/unit/**/*.test.ts"],
        exclude: ["tests/unit/**/*.docker.test.ts"],
        environment: "node"
    }
});
