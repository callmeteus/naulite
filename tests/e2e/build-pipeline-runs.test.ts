import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const buildFixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/build-cr-deploy.compose.yml"
);

const minimalFixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/minimal.compose.yml"
);

const agentAuthHeaders = {
    Accept: "application/json",
    Authorization: "Bearer platform-test-agent-key",
    "Content-Type": "application/json"
};

interface PipelineRunDetail {
    id: string;
    kind: string;
    status: string;
    steps?: Array<{
        name: string;
        status: string;
        logText?: string;
    }>;
    events?: Array<{
        kind: string;
        message: string;
    }>;
}

/**
 * Polls a pipeline run until it reaches a terminal status.
 *
 * @param baseUrl Control plane base URL
 * @param runId Pipeline run identifier
 * @param timeoutMs Maximum wait time in milliseconds
 * @returns Terminal pipeline run detail
 */
async function pollRunUntilTerminal(
    baseUrl: string,
    runId: string,
    timeoutMs = 600_000
): Promise<PipelineRunDetail> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const response = await fetch(`${baseUrl}/runs/${encodeURIComponent(runId)}`, {
            headers: agentAuthHeaders
        });

        expect(response.ok).toBe(true);

        const run = await response.json() as PipelineRunDetail;

        if (run.status === "succeeded" || run.status === "failed") {
            return run;
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 2_000);
        });
    }

    throw new Error(`Pipeline run ${runId} did not reach a terminal status within ${timeoutMs}ms.`);
}

/**
 * Polls pipeline run events until the predicate matches or timeout occurs.
 *
 * @param baseUrl Control plane base URL
 * @param runId Pipeline run identifier
 * @param predicate Event kind matcher
 * @param timeoutMs Maximum wait time in milliseconds
 * @returns Matching event kinds when found
 */
async function pollEventKindsUntil(
    baseUrl: string,
    runId: string,
    predicate: (kinds: string[]) => boolean,
    timeoutMs = 120_000
): Promise<string[]> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const response = await fetch(
            `${baseUrl}/runs/${encodeURIComponent(runId)}/events`,
            { headers: agentAuthHeaders }
        );

        expect(response.ok).toBe(true);

        const events = await response.json() as Array<{ kind: string }>;
        const kinds = events.map((event) => event.kind);

        if (predicate(kinds)) {
            return kinds;
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 2_000);
        });
    }

    throw new Error(`Pipeline run ${runId} did not emit the expected events within ${timeoutMs}ms.`);
}

describe("build pipeline runs", () => {
    let dockerEnabled = false;
    let controlPlaneUrl = "";

    beforeAll(async () => {
        dockerEnabled = await LocalTestCluster.isDockerAvailable();
        LocalTestCluster.assertDockerAvailable(dockerEnabled);
        if (!dockerEnabled) {
            return;
        }

        try {
            await LocalTestCluster.start();
            await LocalTestCluster.waitHealthy();
            controlPlaneUrl = LocalTestCluster.getControlPlaneUrl();
        } catch (err) {
            LocalTestCluster.rethrowIfDockerRequired(err);
            dockerEnabled = false;
        }
    }, 600_000);

    afterAll(async () => {
        if (!dockerEnabled) {
            return;
        }

        await LocalTestCluster.stop();
    }, 180_000);

    it("enqueues an async build, polls the run, and records steps events and logs", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const manifestYaml = await readFile(buildFixturePath, "utf8");
        const applyResponse = await fetch(`${controlPlaneUrl}/apply`, {
            method: "POST",
            headers: agentAuthHeaders,
            body: JSON.stringify({
                manifestYaml,
                buildContextRoot: "/platform/build-fixtures/minimal-web"
            })
        });
        expect(applyResponse.ok).toBe(true);

        const buildResponse = await fetch(`${controlPlaneUrl}/build?wait=false`, {
            method: "POST",
            headers: agentAuthHeaders,
            body: JSON.stringify({ serviceName: "api" })
        });
        expect(buildResponse.status).toBe(202);

        const buildBody = await buildResponse.json() as {
            runId?: string;
            workflowId?: string;
        };
        expect(buildBody.runId).toBeTruthy();

        const run = await pollRunUntilTerminal(controlPlaneUrl, buildBody.runId ?? "");
        expect(run.kind).toBe("ci_build");
        expect(run.status).toBe("succeeded");

        const eventsResponse = await fetch(
            `${controlPlaneUrl}/runs/${encodeURIComponent(buildBody.runId ?? "")}/events`,
            { headers: agentAuthHeaders }
        );
        expect(eventsResponse.ok).toBe(true);

        const events = await eventsResponse.json() as Array<{ kind: string }>;
        const eventKinds = events.map((event) => event.kind);

        expect(eventKinds).toContain("ci.build.submitted");
        expect(eventKinds).toContain("image.build.started");
        expect(eventKinds.some((kind) => kind.startsWith("build.step."))).toBe(true);
        expect(eventKinds).toContain("image.pushed");
        expect(eventKinds).toContain("ci.build.finished");

        expect(run.steps?.length).toBeGreaterThan(0);
        expect(run.steps?.some((step) => step.status === "succeeded")).toBe(true);
        expect(run.steps?.some((step) => Boolean(step.logText))).toBe(true);
    }, 600_000);

    it("records deploy step events when applying a manifest", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const manifestYaml = await readFile(minimalFixturePath, "utf8");
        const applyResponse = await fetch(`${controlPlaneUrl}/apply`, {
            method: "POST",
            headers: agentAuthHeaders,
            body: JSON.stringify({ manifestYaml })
        });
        expect(applyResponse.ok).toBe(true);

        const applyBody = await applyResponse.json() as { runId?: string };
        expect(applyBody.runId).toBeTruthy();

        const eventKinds = await pollEventKindsUntil(
            controlPlaneUrl,
            applyBody.runId ?? "",
            (kinds) => kinds.some((kind) => kind.startsWith("deploy.step."))
        );

        expect(eventKinds).toContain("rollout.started");
        expect(eventKinds.some((kind) => kind.startsWith("deploy.step."))).toBe(true);

        const runResponse = await fetch(
            `${controlPlaneUrl}/runs/${encodeURIComponent(applyBody.runId ?? "")}`,
            { headers: agentAuthHeaders }
        );
        expect(runResponse.ok).toBe(true);

        const run = await runResponse.json() as PipelineRunDetail;
        expect(run.steps?.some((step) => step.name === "create" || step.name === "start")).toBe(true);
    }, 180_000);
});
