import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../../packages/ui/packages/backend/src/App";
import { buildSessionCookie, NAULITE_SESSION_COOKIE } from "../../../packages/ui/packages/backend/src/auth/SessionCookie";
import { NAULITE_CSRF_COOKIE } from "../../../packages/ui/packages/backend/src/auth/CsrfProtection";

describe("ui-backend auth", () => {
    afterEach(() => {
        delete process.env.ADMIN_API_KEY;
    });

    it("allows unauthenticated health checks", async () => {
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/health"
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            status: "ok",
            service: "ui-backend"
        });

        await app.close();
    });

    it("allows unauthenticated session checks on GET /auth/me", async () => {
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/auth/me"
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ user: null });

        await app.close();
    });

    it("rejects cluster routes without authorization", async () => {
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/nodes"
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Não autorizado." });

        await app.close();
    });

    it("accepts legacy bearer automation tokens as admin", async () => {
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });

        app.controlPlane = {
            listNodes: async () => []
        } as unknown as typeof app.controlPlane;

        const response = await app.inject({
            method: "GET",
            url: "/nodes",
            headers: {
                authorization: "Bearer secret-key"
            }
        });

        expect(response.statusCode).toBe(200);

        await app.close();
    });

    it("rejects cluster routes with an invalid bearer token", async () => {
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/nodes",
            headers: {
                authorization: "Bearer wrong-key"
            }
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Não autorizado." });

        await app.close();
    });

    it("rejects protected routes when neither session nor service token is configured", async () => {
        const app = await createApp({
            adminApiKey: undefined,
            logger: false
        });

        const response = await app.inject({
            method: "GET",
            url: "/nodes"
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ message: "Não autorizado." });

        await app.close();
    });
});

describe("ui-backend auth routes", () => {
    afterEach(() => {
        delete process.env.ADMIN_API_KEY;
    });

    it("proxies login, me, and logout with naulite_session cookie", async () => {
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });

        app.controlPlane = {
            adminLogin: async () => ({
                sessionToken: "session-abc",
                user: {
                    id: "user-1",
                    email: "admin@example.com",
                    role: "admin",
                    tenantId: null,
                    createdAt: "2026-07-02T00:00:00.000Z"
                }
            }),
            withSession: (token: string) => ({
                getAdminMe: async () => ({
                    user: {
                        id: "user-1",
                        email: "admin@example.com",
                        role: "admin",
                        tenantId: null,
                        createdAt: "2026-07-02T00:00:00.000Z"
                    }
                }),
                adminLogout: async () => undefined
            }),
            listNodes: async () => []
        } as unknown as typeof app.controlPlane;

        const loginResponse = await app.inject({
            method: "POST",
            url: "/auth/login",
            payload: {
                email: "admin@example.com",
                password: "secret-pass"
            }
        });

        expect(loginResponse.statusCode).toBe(200);
        expect(loginResponse.json().user.email).toBe("admin@example.com");
        expect(loginResponse.json().csrfToken).toBeTruthy();
        const setCookie = loginResponse.headers["set-cookie"];
        const cookieHeader = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie ?? "");
        expect(cookieHeader).toContain("naulite_session=");

        const csrfToken = loginResponse.json().csrfToken;

        const meResponse = await app.inject({
            method: "GET",
            url: "/auth/me",
            headers: {
                cookie: `${buildSessionCookie("session-abc")}; ${NAULITE_CSRF_COOKIE}=${encodeURIComponent(csrfToken)}`
            }
        });

        expect(meResponse.statusCode).toBe(200);
        expect(meResponse.json().user.role).toBe("admin");
        expect(meResponse.json().csrfToken).toBe(csrfToken);

        const meWithoutCsrfResponse = await app.inject({
            method: "GET",
            url: "/auth/me",
            headers: {
                cookie: buildSessionCookie("session-abc")
            }
        });

        expect(meWithoutCsrfResponse.statusCode).toBe(200);
        expect(meWithoutCsrfResponse.json().user.email).toBe("admin@example.com");
        expect(meWithoutCsrfResponse.json().csrfToken).toBeTruthy();
        const meWithoutCsrfCookies = meWithoutCsrfResponse.headers["set-cookie"];
        const meWithoutCsrfCookieHeader = Array.isArray(meWithoutCsrfCookies)
            ? meWithoutCsrfCookies.join(";")
            : String(meWithoutCsrfCookies ?? "");
        expect(meWithoutCsrfCookieHeader).toContain(`${NAULITE_CSRF_COOKIE}=`);

        const logoutResponse = await app.inject({
            method: "POST",
            url: "/auth/logout",
            headers: {
                cookie: `${NAULITE_SESSION_COOKIE}=${encodeURIComponent("session-abc")}; ${NAULITE_CSRF_COOKIE}=${encodeURIComponent(csrfToken)}`,
                "x-csrf-token": csrfToken
            }
        });

        expect(logoutResponse.statusCode).toBe(200);
        const logoutCookies = logoutResponse.headers["set-cookie"];
        const logoutCookieHeader = Array.isArray(logoutCookies) ? logoutCookies.join(";") : String(logoutCookies ?? "");
        expect(logoutCookieHeader).toContain("Max-Age=0");

        await app.close();
    });
});
