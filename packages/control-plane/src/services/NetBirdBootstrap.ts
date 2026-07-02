import { randomBytes } from "node:crypto";

import type { ControlPlaneStore } from "../database/ControlPlaneStore";

import { NetBirdConfig } from "./NetBirdConfig";

/**
 * Internal NetBird credentials managed by the control plane.
 */
export interface NetBirdCredentials {
    apiToken: string;
    superadminEmail: string;
    superadminPassword: string;
}

/**
 * Cluster secret name for NetBird internal credentials.
 */
export const NETBIRD_INTERNAL_SECRET_NAME = "netbird/internal";

namespace Errors {
    /**
     * Creates an error when NetBird is initialized without platform credentials.
     *
     * @returns Domain error
     */
    export function missingCredentialsAfterSetup() {
        return new Error(
            "NetBird setup is complete but platform credentials are missing. "
            + "Reset the netbird_data volume for a fresh bootstrap, "
            + "or set NETBIRD_TOKEN once to import credentials."
        );
    }
}

/**
 * Bootstraps self-hosted NetBird and persists internal credentials as cluster secrets.
 */
export namespace NetBirdBootstrap {
    const SUPERADMIN_EMAIL = "superadmin@platform.internal";
    const SUPERADMIN_NAME = "Platform Superadmin";
    const PAT_EXPIRE_DAYS = 365;
    const POLL_INTERVAL_MS = 2000;
    const MAX_POLL_ATTEMPTS = 60;

    /**
     * Ensures NetBird API credentials exist, bootstrapping on first run when needed.
     *
     * @param store Control plane persistence layer
     * @param options Optional API URL and fetch implementation
     * @returns NetBird credentials for API access
     */
    export async function ensureCredentials(
        store: ControlPlaneStore,
        options?: {
            apiUrl?: string;
            fetchImpl?: typeof fetch;
        }
    ): Promise<NetBirdCredentials> {
        if (NetBirdConfig.useMockAdapter()) {
            return {
                apiToken: "mock-netbird-token",
                superadminEmail: SUPERADMIN_EMAIL,
                superadminPassword: "mock-password-not-used"
            };
        }

        const cached = await readStoredCredentials(store);

        if (cached) {
            console.debug("[netbird] using stored internal credentials secret=%s", NETBIRD_INTERNAL_SECRET_NAME);
            return cached;
        }

        const envToken = process.env.NETBIRD_TOKEN?.trim();

        if (envToken) {
            console.debug("[netbird] importing credentials from NETBIRD_TOKEN env");
            const imported: NetBirdCredentials = {
                apiToken: envToken,
                superadminEmail: SUPERADMIN_EMAIL,
                superadminPassword: ""
            };
            await persistCredentials(store, imported);
            return imported;
        }

        const apiUrl = options?.apiUrl ?? NetBirdConfig.resolveApiUrl();
        const fetchImpl = options?.fetchImpl ?? fetch;

        try {
            const bootstrapped = await bootstrapSelfHosted(apiUrl, fetchImpl);
            await persistCredentials(store, bootstrapped);
            console.debug("[netbird] bootstrap complete email=%s", bootstrapped.superadminEmail);
            return bootstrapped;
        } catch (err) {
            const raced = await readStoredCredentials(store);

            if (raced) {
                console.debug("[netbird] using credentials written by another control plane instance");
                return raced;
            }

            throw err;
        }
    }

    /**
     * Reads NetBird credentials from the cluster secret store.
     *
     * @param store Control plane persistence layer
     * @returns Stored credentials when present
     */
    async function readStoredCredentials(store: ControlPlaneStore): Promise<NetBirdCredentials | null> {
        const values = await store.getClusterSecretValues(NETBIRD_INTERNAL_SECRET_NAME);

        if (!values?.apiToken) {
            return null;
        }

        return {
            apiToken: values.apiToken,
            superadminEmail: values.superadminEmail ?? SUPERADMIN_EMAIL,
            superadminPassword: values.superadminPassword ?? ""
        };
    }

    /**
     * Persists NetBird credentials as an internal cluster secret.
     *
     * @param store Control plane persistence layer
     * @param credentials Credentials to store
     * @returns Nothing.
     */
    async function persistCredentials(
        store: ControlPlaneStore,
        credentials: NetBirdCredentials
    ): Promise<void> {
        await store.upsertClusterSecret({
            name: NETBIRD_INTERNAL_SECRET_NAME,
            keys: ["apiToken", "superadminEmail", "superadminPassword"],
            description: "Internal NetBird management credentials (not exposed in the UI).",
            value: {
                apiToken: credentials.apiToken,
                superadminEmail: credentials.superadminEmail,
                superadminPassword: credentials.superadminPassword
            }
        });
    }

    /**
     * Polls NetBird and runs first-time setup when required.
     *
     * @param apiUrl NetBird API base URL
     * @param fetchImpl Fetch implementation
     * @returns Bootstrapped credentials
     */
    async function bootstrapSelfHosted(apiUrl: string, fetchImpl: typeof fetch): Promise<NetBirdCredentials> {
        const normalizedApiUrl = apiUrl.replace(/\/+$/, "");
        let setupRequired: boolean | null = null;

        for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
            try {
                const status = await fetchInstanceStatus(normalizedApiUrl, fetchImpl);
                setupRequired = status.setupRequired;
                break;
            } catch (err) {
                console.debug(
                    "[netbird] waiting for management API attempt=%d/%d err=%s",
                    attempt,
                    MAX_POLL_ATTEMPTS,
                    err instanceof Error ? err.message : String(err)
                );
                await sleep(POLL_INTERVAL_MS);
            }
        }

        if (setupRequired === null) {
            throw new Error("NetBird management API did not become reachable in time.");
        }

        if (!setupRequired) {
            throw Errors.missingCredentialsAfterSetup();
        }

        const password = generateSuperadminPassword();

        try {
            const setup = await runSetup(normalizedApiUrl, fetchImpl, password);

            if (!setup.personalAccessToken) {
                throw new Error(
                    "NetBird setup succeeded but no personal access token was returned. "
                    + "Ensure NB_SETUP_PAT_ENABLED=true on netbird-server."
                );
            }

            return {
                apiToken: setup.personalAccessToken,
                superadminEmail: SUPERADMIN_EMAIL,
                superadminPassword: password
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);

            if (message.includes("setup") && message.includes("completed")) {
                throw Errors.missingCredentialsAfterSetup();
            }

            throw err;
        }
    }

    /**
     * Fetches NetBird instance bootstrap status.
     *
     * @param apiUrl NetBird API base URL
     * @param fetchImpl Fetch implementation
     * @returns Whether initial setup is still required
     */
    async function fetchInstanceStatus(
        apiUrl: string,
        fetchImpl: typeof fetch
    ): Promise<{ setupRequired: boolean }> {
        const response = await fetchImpl(`${apiUrl}/instance`, {
            headers: { Accept: "application/json" }
        });

        if (!response.ok) {
            throw new Error(`NetBird instance status failed with HTTP ${response.status}.`);
        }

        const payload = await response.json() as { setup_required?: boolean };
        return {
            setupRequired: payload.setup_required === true
        };
    }

    /**
     * Creates the first NetBird owner user and personal access token.
     *
     * @param apiUrl NetBird API base URL
     * @param fetchImpl Fetch implementation
     * @param password Generated superadmin password
     * @returns Setup response fields
     */
    async function runSetup(
        apiUrl: string,
        fetchImpl: typeof fetch,
        password: string
    ): Promise<{ personalAccessToken?: string }> {
        const response = await fetchImpl(`${apiUrl}/setup`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: SUPERADMIN_EMAIL,
                name: SUPERADMIN_NAME,
                password,
                create_pat: true,
                pat_expire_in: PAT_EXPIRE_DAYS
            })
        });

        const text = await response.text();
        const payload = text.length > 0 ? JSON.parse(text) as {
            personal_access_token?: string;
            message?: string;
        } : {};

        if (!response.ok) {
            throw new Error(payload.message ?? `NetBird setup failed with HTTP ${response.status}.`);
        }

        return {
            personalAccessToken: payload.personal_access_token
        };
    }

    /**
     * Generates a random superadmin password for NetBird embedded IdP.
     *
     * @returns Password meeting NetBird minimum length
     */
    function generateSuperadminPassword(): string {
        return randomBytes(24).toString("base64url");
    }

    /**
     * Sleeps for the given duration.
     *
     * @param ms Milliseconds to wait
     * @returns Nothing.
     */
    function sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}
