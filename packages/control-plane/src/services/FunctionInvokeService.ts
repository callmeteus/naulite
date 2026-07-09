import { randomUUID } from "node:crypto";

import type { ResolvedSecret, SecretFilter, Service } from "@naulite/shared";
import { DurationUtils } from "@naulite/shared";

import { ControlPlaneService } from "../ControlPlaneService";
import { Logger } from "../Logger";
import { HTTP404Error, HTTP503Error } from "../errors/TreatedError";
import { AgentProxyService } from "./AgentProxyService";
const logFunctions = Logger.create("functions");

/**
 * Orchestrates ephemeral server function invocations: scheduling, agent dispatch,
 * persistence of function run records, and timeout enforcement.
 */
export class FunctionInvokeService {
    /**
     * Invokes a manifest-declared function on an eligible agent node.
     *
     * @param serviceName Logical service name from the manifest
     * @param options Invocation source and optional payload or environment overrides
     * @returns Newly created function run identifier
     * @throws {HTTP404Error} {@link HTTP404Error}
     * @throws {HTTP503Error} {@link HTTP503Error}
     */
    static async invoke(serviceName: string, options: {
        source: "api" | "cli" | "cron" | "http";
        payload?: unknown;
        environment?: Record<string, string>;
    }): Promise<{ runId: string }> {
        const context = ControlPlaneService.requireContext();
        const services = await ControlPlaneService.Store.listServices();
        const service = services.find((entry) => entry.name === serviceName);

        if (!service) {
            throw new HTTP404Error(`Service ${serviceName} not found.`, { error: "not_found" });
        }

        if (!service.functionSpec) {
            throw new HTTP404Error(`Service ${serviceName} is not a function.`, { error: "not_found" });
        }

        FunctionInvokeService.assertTriggerAllowed(service, options.source);

        const nodes = await ControlPlaneService.Store.listNodes();
        const scheduled = context.scheduler.schedule(service, undefined, nodes);

        if (!scheduled?.node.agentUrl) {
            throw new HTTP503Error("No agent is available to run the function.");
        }

        const runId = randomUUID();
        const startedAt = new Date().toISOString();
        const timeoutMs = FunctionInvokeService.resolveTimeoutMs(service.functionSpec);

        await ControlPlaneService.Store.instance().createFunctionRun({
            id: runId,
            serviceId: service.id,
            serviceName: service.name,
            manifestName: service.manifestName,
            nodeId: scheduled.node.id,
            status: "running",
            source: options.source,
            payload: {
                payload: options.payload ?? null
            }
        });

        const secrets = await FunctionInvokeService.resolveSecretsForService(service);
        const environment = {
            ...(service.deploySpec?.environment ?? {}),
            ...(options.environment ?? {})
        };

        logFunctions.debug(
            "invoke runId=%s service=%s node=%s timeoutMs=%d",
            runId,
            service.name,
            scheduled.node.id,
            timeoutMs
        );

        try {
            const agentResponse = await AgentProxyService.postTask(scheduled.node.agentUrl, "/tasks/function", {
                taskId: runId,
                runId,
                manifestName: service.manifestName,
                serviceName: service.name,
                image: service.image,
                command: service.deploySpec?.command ?? [],
                environment,
                secrets,
                networks: service.networks ?? [],
                volumeMounts: service.deploySpec?.volumeMounts ?? [],
                timeoutMs,
                payload: options.payload,
                triggeredBy: options.source,
                cpUrl: process.env.NAULITE_PUBLIC_URL?.replace(/\/+$/, "") ?? "http://localhost:8080",
                apiKey: process.env.NAULITE_AGENT_API_KEY?.trim()
            }) as {
                status?: string;
                exitCode?: number;
                logs?: string;
                timedOut?: boolean;
                error?: string;
            };

            const completedAt = new Date().toISOString();
            const durationMs = Date.parse(completedAt) - Date.parse(startedAt);
            const status = agentResponse.timedOut ? "timed_out" : (agentResponse.status ?? "completed");

            await ControlPlaneService.Store.instance().updateFunctionRun(runId, {
                status,
                exitCode: agentResponse.exitCode ?? null,
                logs: agentResponse.logs ?? null,
                completedAt,
                durationMs,
                errorMessage: agentResponse.error ?? null
            });

            return { runId };
        } catch (err) {
            await ControlPlaneService.Store.instance().updateFunctionRun(runId, {
                status: "failed",
                completedAt: new Date().toISOString(),
                errorMessage: err instanceof Error ? err.message : "Function dispatch failed."
            });

            throw err;
        }
    }

    private static resolveTimeoutMs(spec: NonNullable<Service["functionSpec"]>): number {
        const timeout = spec.timeout ?? "60s";
        const ms = DurationUtils.parseToMs(timeout);
        return Math.min(Math.max(ms, 1_000), 900_000);
    }

    private static assertTriggerAllowed(service: Service, source: "api" | "cli" | "cron" | "http"): void {
        const trigger = service.functionSpec?.trigger;

        if (!trigger) {
            throw new HTTP503Error("Function trigger is not configured.");
        }

        if (source === "cron") {
            if (!trigger.cron) {
                throw new HTTP503Error("Function cron trigger is not configured.");
            }

            return;
        }

        if (!trigger.http) {
            throw new HTTP503Error("Function HTTP trigger is disabled.");
        }
    }

    private static async resolveSecretsForService(service: Service): Promise<ResolvedSecret[]> {
        const secretProvider = ControlPlaneService.requireContext().secretProvider;
        const secrets = service.deploySpec?.secrets ?? [];
        const secretNames: string[] = [];
        const allowedKeys: Record<string, string[]> = {};

        for (const reference of secrets) {
            secretNames.push(reference.secretName);

            if (reference.key) {
                allowedKeys[reference.secretName] = [
                    ...(allowedKeys[reference.secretName] ?? []),
                    reference.key
                ];
            }
        }

        const filter: SecretFilter = {
            secretNames: [...new Set(secretNames)],
            allowedKeys: Object.keys(allowedKeys).length > 0 ? allowedKeys : undefined
        };

        if (filter.secretNames.length === 0) {
            return [];
        }

        return secretProvider.resolveForAgent(filter);
    }
}

