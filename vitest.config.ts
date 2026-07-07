import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            "@naulite/shared": path.resolve(rootDir, "packages/nodejs/shared/src/index.ts"),
            "@naulite/logger": path.resolve(rootDir, "packages/nodejs/logger/src/index.ts"),
            "@naulite/sdk": path.resolve(rootDir, "packages/sdk/src/index.ts"),
            "@naulite/gateway": path.resolve(rootDir, "packages/gateway/src/index.ts"),
            "@naulite/control-plane": path.resolve(rootDir, "packages/control-plane/src/index.ts"),
            "@naulite/plugin-s3-storage-provider": path.resolve(rootDir, "packages/plugins/s3-storage-provider/src/index.ts"),
            "@naulite/plugin-infisical-secret-provider": path.resolve(rootDir, "packages/plugins/infisical-secret-provider/src/index.ts"),
            "@naulite/plugin-aws-node-provisioner": path.resolve(rootDir, "packages/plugins/aws-node-provisioner/src/index.ts"),
            "@naulite/plugin-notification-slack": path.resolve(rootDir, "packages/plugins/notification-slack/src/index.ts"),
            "@naulite/plugin-notification-webhook": path.resolve(rootDir, "packages/plugins/notification-webhook/src/index.ts"),
            "@naulite/builder-docker": path.resolve(rootDir, "packages/builders/docker/src/index.ts"),
            "@naulite/builder-kaniko": path.resolve(rootDir, "packages/builders/kaniko/src/index.ts"),
            "@naulite/runtime-docker": path.resolve(rootDir, "packages/runtimes/docker/src/index.ts"),
            "@naulite/runtime-podman": path.resolve(rootDir, "packages/runtimes/podman/src/index.ts"),
            "@naulite/runtime-containerd": path.resolve(rootDir, "packages/runtimes/containerd/src/index.ts")
        }
    },
    test: {
        include: ["tests/unit/**/*.test.ts"],
        exclude: ["tests/unit/**/*.docker.test.ts"],
        environment: "node"
    }
});
