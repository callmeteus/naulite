import type { FastifyInstance } from "fastify";
import { NauliteApiError } from "@naulite/sdk";
import { z } from "zod";

import { CsrfProtection, NAULITE_CSRF_COOKIE } from "../auth/CsrfProtection";
import { RolePreHandlers } from "../auth/RolePreHandlers";
import { buildClearSessionCookie, buildSessionCookie, parseCookies, resolveSecureCookies } from "../auth/SessionCookie";
import { resolveConfigFromEnv } from "../Config";

const LoginBodySchema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
});

/**
 * Registers browser session authentication routes for the admin BFF.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
    app.post("/auth/login", async (request, reply) => {
        const body = LoginBodySchema.parse(request.body);

        let login;

        try {
            login = await app.controlPlane.adminLogin(body);
        } catch (error) {
            if (error instanceof NauliteApiError) {
                throw Object.assign(new Error(error.message), { statusCode: error.status });
            }

            const controlPlaneUrl = resolveConfigFromEnv().controlPlaneInstances[0] ?? "http://localhost:18080";
            const message = error instanceof Error && error.message.toLowerCase().includes("fetch failed")
                ? `Não foi possível contactar o control plane em ${controlPlaneUrl}. Inicie com "yarn workspace @naulite/control-plane dev".`
                : error instanceof Error
                    ? error.message
                    : "Falha ao autenticar no control plane.";

            throw Object.assign(new Error(message), { statusCode: 503 });
        }

        const csrfToken = CsrfProtection.generateToken();
        const secureCookies = resolveSecureCookies();

        reply.header("Set-Cookie", [
            buildSessionCookie(login.sessionToken),
            CsrfProtection.buildCsrfCookie(csrfToken, secureCookies)
        ]);

        return {
            user: login.user,
            csrfToken
        };
    });

    app.post("/auth/logout", async (request, reply) => {
        const sessionToken = RolePreHandlers.readSessionToken(request);

        if (sessionToken) {
            try {
                await app.controlPlane.withSession(sessionToken).adminLogout();
            } catch {
                // Clear the browser cookie even when the upstream session is already gone.
            }
        }

        reply.header("Set-Cookie", [
            buildClearSessionCookie(),
            CsrfProtection.buildClearCsrfCookie(resolveSecureCookies())
        ]);

        return { ok: true };
    });

    app.get("/auth/me", async (request) => {
        const sessionToken = RolePreHandlers.readSessionToken(request);

        if (sessionToken) {
            try {
                const session = await request.server.controlPlane
                    .withSession(sessionToken)
                    .getAdminMe();

                const cookies = parseCookies(request.headers.cookie);
                const csrfToken = cookies[NAULITE_CSRF_COOKIE];

                return {
                    user: session.user,
                    csrfToken: csrfToken || undefined
                };
            } catch {
                return { user: null };
            }
        }

        return { user: null };
    });
}
