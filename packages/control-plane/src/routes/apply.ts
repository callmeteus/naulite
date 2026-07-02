import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AgentDispatcher } from "../services/AgentDispatcher.js";

const ApplyBodySchema = z.object({
    manifestYaml: z.string().min(1).optional(),
    manifest: z.string().min(1).optional()
}).refine((body) => body.manifestYaml !== undefined || body.manifest !== undefined, {
    message: "manifestYaml or manifest is required."
});

/**
 * Registers manifest apply routes.
 * 
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerApplyRoutes(app: FastifyInstance): Promise<void> {
    app.post("/apply", async (request) => {
        const body = ApplyBodySchema.parse(request.body);
        const manifestYaml = body.manifestYaml ?? body.manifest ?? "";
        const manifest = app.controlPlane.composeParser.parse(manifestYaml);
        const [services, instances, volumes, nodes] = await Promise.all([
            app.controlPlane.store.listServices(),
            app.controlPlane.store.listInstances(),
            app.controlPlane.store.listVolumes(),
            app.controlPlane.store.listNodes()
        ]);

        const diff = app.controlPlane.planner.diff(manifest, {
            services,
            instances,
            volumes
        });

        app.controlPlane.applyRevision += 1;

        for (const service of [...diff.servicesToCreate, ...diff.servicesToUpdate]) {
            const manifestService = manifest.services[service.name];
            await app.controlPlane.store.upsertService(service);

            const schedule = app.controlPlane.scheduler.schedule(
                service,
                manifestService,
                nodes
            );

            if (schedule) {
                for (const instance of diff.instancesToCreate.filter((entry) => entry.serviceId === service.id)) {
                    await app.controlPlane.store.insertInstance({
                        ...instance,
                        nodeId: schedule.node.id,
                        updatedAt: new Date().toISOString()
                    });
                }
            }
        }

        for (const volume of diff.volumesToEnsure) {
            await app.controlPlane.store.insertVolume(volume);
        }

        for (const service of diff.servicesToRemove) {
            await app.controlPlane.store.deleteService(service.id);
        }

        const exposures = app.controlPlane.composeParser.extractInternalExposures(manifest);
        const exposurePlan = app.controlPlane.exposurePlanner.plan(manifest, exposures);

        for (const entry of exposurePlan.entries) {
            await app.controlPlane.netBirdService.ensureInternalGroup(entry.netbirdGroupName);
        }

        await app.controlPlane.gitOpsService.recordRevision(
            {
                repositoryUrl: "inline://apply",
                branch: "main",
                commitSha: `rev-${app.controlPlane.applyRevision}`
            },
            body.manifestYaml ?? body.manifest ?? "",
            manifest
        );

        await app.controlPlane.controlPlaneSync.publish("apply", {
            manifestName: manifest.name,
            revision: app.controlPlane.applyRevision
        });

        const plans = nodes.map((node) => {
            return app.controlPlane.planner.buildExecutionPlan(
                manifest.name,
                node.id,
                app.controlPlane.applyRevision,
                diff.operations
            );
        });

        const dispatch = await AgentDispatcher.dispatchPlans(plans, nodes);

        for (const result of dispatch) {
            app.log.debug(
                {
                    nodeId: result.nodeId,
                    planId: result.planId,
                    status: result.status,
                    agentUrl: result.agentUrl
                },
                "agent dispatch result"
            );
        }

        return {
            revision: app.controlPlane.applyRevision,
            manifestName: manifest.name,
            diff: {
                servicesToCreate: diff.servicesToCreate.length,
                servicesToUpdate: diff.servicesToUpdate.length,
                servicesToRemove: diff.servicesToRemove.length,
                instancesToCreate: diff.instancesToCreate.length,
                instancesToRemove: diff.instancesToRemove.length,
                volumesToEnsure: diff.volumesToEnsure.length,
                volumesToRemove: diff.volumesToRemove.length
            },
            exposurePlan,
            plans,
            dispatch
        };
    });
}
