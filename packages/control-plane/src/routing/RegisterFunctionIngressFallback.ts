import type { FastifyInstance } from "fastify";

import { ControlPlaneService } from "../ControlPlaneService";
import { Logger } from "../Logger";
import { FunctionInvokeService } from "../services/FunctionInvokeService";
const logIngressFunctions = Logger.create("functions-ingress");

/**
 * Registers a Fastify not-found handler that proxies HTTP ingress to function invoke.
 *
 * @param app Fastify instance for the control plane HTTP server
 */
export async function registerFunctionIngressFallback(app: FastifyInstance): Promise<void> {
    app.setNotFoundHandler(async (req, res) => {
        const forwardedHost = req.headers["x-forwarded-host"];
        const hostHeader = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
        const rawHost = hostHeader ?? req.headers.host;
        const host = typeof rawHost === "string" ? rawHost.split(":")[0] : undefined;

        if (!host) {
            return res.status(404).send({ error: "not_found", message: "No host header." });
        }

        const services = await ControlPlaneService.Store.listServices();
        const functionService = services.find((service) => {
            return Boolean(service.functionSpec?.trigger?.http)
                && service.ingress?.host === host;
        });

        if (!functionService) {
            return res.status(404).send({ error: "not_found", message: "Not found." });
        }

        logIngressFunctions.debug("ingress invoke host=%s service=%s method=%s url=%s", host, functionService.name, req.method, req.url);

        const run = await FunctionInvokeService.invoke(functionService.name, {
            source: "http",
            payload: {
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: req.body ?? null
            }
        });

        return res.status(202).send({
            ok: true,
            runId: run.runId
        });
    });
}

