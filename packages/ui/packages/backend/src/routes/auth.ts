import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { CsrfProtection } from "../auth/CsrfProtection";
import { buildClearSessionCookie, buildSessionCookie, resolveSecureCookies } from "../auth/SessionCookie";
import { RolePreHandlers } from "../auth/RolePreHandlers";

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
        const login = await app.controlPlane.adminLogin(body);
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
        const user = request.adminUser;

        if (!user) {
            return { user: null };
        }

        return { user };
    });
}
