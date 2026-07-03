import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../packages/control-plane/src/App";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import { GitOpsService } from "../../../packages/control-plane/src/services/GitOpsService";
import { ApplyService } from "../../../packages/control-plane/src/services/ApplyService";

const mocks = vi.hoisted(() => ({
    checkoutAndMerge: vi.fn(async () => ({
        manifestYaml: "name: webhook-test\nservices:\n  web:\n    image: nginx:1.27",
        commitSha: "abc123def456abc123def456abc123def456abcd",
        workDir: "/tmp/gitops-test"
    })),
    applyExecute: vi.fn(async () => ({
        revision: 1,
        manifestName: "webhook-test",
        diff: {
            servicesToCreate: 0,
            servicesToUpdate: 0,
            servicesToRemove: 0,
            instancesToCreate: 0,
            instancesToRemove: 0,
            volumesToEnsure: 0,
            volumesToRemove: 0
        },
        exposurePlan: { entries: [] },
        plans: [],
        dispatch: { accepted: 0, rejected: 0 }
    }))
}));

vi.mock("../../../packages/control-plane/src/services/GitOpsService", async () => {
    const actual = await vi.importActual<typeof import("../../../packages/control-plane/src/services/GitOpsService")>(
        "../../../packages/control-plane/src/services/GitOpsService"
    );

    return {
        ...actual,
        GitOpsService: {
            ...actual.GitOpsService,
            checkoutAndMerge: mocks.checkoutAndMerge,
            recordRevision: vi.fn(),
            listRevisions: vi.fn(async () => []),
            getRevision: vi.fn(),
            rollback: vi.fn(),
            configure: vi.fn()
        }
    };
});

vi.mock("../../../packages/control-plane/src/services/ApplyService", async () => {
    const actual = await vi.importActual<typeof import("../../../packages/control-plane/src/services/ApplyService")>(
        "../../../packages/control-plane/src/services/ApplyService"
    );

    return {
        ...actual,
        ApplyService: {
            ...actual.ApplyService,
            execute: mocks.applyExecute
        }
    };
});

const ENV_KEYS = [
    "GITOPS_WEBHOOK_SECRET",
    "GITOPS_WEBHOOK_PROVIDER"
] as const;

const originalEnv: Record<string, string | undefined> = {};

/**
 * Snapshots GitOps webhook environment variables.
 *
 * @returns Nothing.
 */
function snapshotEnv(): void {
    for (const key of ENV_KEYS) {
        originalEnv[key] = process.env[key];
    }
}

/**
 * Restores GitOps webhook environment variables.
 *
 * @returns Nothing.
 */
function restoreEnv(): void {
    for (const key of ENV_KEYS) {
        if (originalEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = originalEnv[key];
        }
    }
}

/**
 * Builds a minimal control plane context for webhook route tests.
 *
 * @returns Mocked control plane context
 */
function createWebhookTestContext(): ControlPlaneContext {
    return {
        store: {
            validateApiKey: vi.fn(async () => false),
            getClusterSecretValues: vi.fn(async () => ({}))
        },
        controlPlaneSync: {
            publish: vi.fn(async () => undefined)
        },
        leaderElection: {
            isLeader: vi.fn(() => true),
            getLeaderId: vi.fn(() => "test-leader"),
            requireLeader: vi.fn()
        },
        netBirdEnrollment: {
            ensureSetupKey: vi.fn(async () => "setup-key-generated")
        }
    } as unknown as ControlPlaneContext;
}

describe("gitops webhook signature integration", () => {
    afterEach(() => {
        restoreEnv();
        mocks.checkoutAndMerge.mockClear();
        mocks.applyExecute.mockClear();
    });

    it("rejects webhook requests with an invalid signature when a secret is configured", async () => {
        snapshotEnv();
        process.env.GITOPS_WEBHOOK_SECRET = "webhook-secret";
        process.env.GITOPS_WEBHOOK_PROVIDER = "github";

        const checkoutSpy = mocks.checkoutAndMerge;
        const applySpy = mocks.applyExecute;
        checkoutSpy.mockClear();
        applySpy.mockClear();

        const app = await createApp({
            context: createWebhookTestContext(),
            logger: false
        });

        const payload = {
            repositoryUrl: "https://example.com/acme/app.git",
            branch: "main",
            overlayPaths: []
        };
        const rawBody = JSON.stringify(payload);

        const response = await app.inject({
            method: "POST",
            url: "/gitops/webhook",
            remoteAddress: "203.0.113.10",
            headers: {
                "content-type": "application/json",
                "x-hub-signature-256": "sha256=deadbeef"
            },
            payload: rawBody
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Invalid webhook signature." });
        expect(checkoutSpy).not.toHaveBeenCalled();
        expect(applySpy).not.toHaveBeenCalled();

        await app.close();
    });

    it("accepts webhook requests with a valid GitHub signature", async () => {
        snapshotEnv();
        const secret = "webhook-secret";
        process.env.GITOPS_WEBHOOK_SECRET = secret;
        process.env.GITOPS_WEBHOOK_PROVIDER = "github";

        mocks.checkoutAndMerge.mockClear();
        mocks.applyExecute.mockClear();

        const app = await createApp({
            context: createWebhookTestContext(),
            logger: false
        });

        const payload = {
            repositoryUrl: "https://example.com/acme/app.git",
            branch: "main",
            overlayPaths: ["overlays/staging.compose.yml"]
        };
        const rawBody = JSON.stringify(payload);
        const digest = createHmac("sha256", secret).update(rawBody).digest("hex");

        const response = await app.inject({
            method: "POST",
            url: "/gitops/webhook",
            remoteAddress: "203.0.113.10",
            headers: {
                "content-type": "application/json",
                "x-hub-signature-256": `sha256=${digest}`
            },
            payload: rawBody
        });

        expect(response.statusCode).toBe(200);
        expect(mocks.checkoutAndMerge).toHaveBeenCalledWith({
            repositoryUrl: payload.repositoryUrl,
            branch: "main",
            commitSha: undefined,
            overlayPaths: payload.overlayPaths,
            manifestPath: "compose.yaml"
        });
        expect(mocks.applyExecute).toHaveBeenCalledWith(
            "name: webhook-test\nservices:\n  web:\n    image: nginx:1.27",
            {
                repositoryUrl: payload.repositoryUrl,
                branch: "main",
                commitSha: "abc123def456abc123def456abc123def456abcd",
                buildContextRoot: "/tmp/gitops-test"
            }
        );

        await app.close();
    });

    it("accepts webhook requests with a valid generic signature", async () => {
        snapshotEnv();
        const secret = "platform-secret";
        process.env.GITOPS_WEBHOOK_SECRET = secret;
        process.env.GITOPS_WEBHOOK_PROVIDER = "generic";

        mocks.checkoutAndMerge.mockClear();
        mocks.applyExecute.mockClear();

        const app = await createApp({
            context: createWebhookTestContext(),
            logger: false
        });

        const payload = {
            repositoryUrl: "https://example.com/acme/app.git",
            branch: "main"
        };
        const rawBody = JSON.stringify(payload);
        const digest = createHmac("sha256", secret).update(rawBody).digest("hex");

        const response = await app.inject({
            method: "POST",
            url: "/gitops/webhook",
            remoteAddress: "203.0.113.10",
            headers: {
                "content-type": "application/json",
                "x-platform-signature": digest
            },
            payload: rawBody
        });

        expect(response.statusCode).toBe(200);
        expect(mocks.checkoutAndMerge).toHaveBeenCalledTimes(1);
        expect(mocks.applyExecute).toHaveBeenCalledTimes(1);

        await app.close();
    });
});
