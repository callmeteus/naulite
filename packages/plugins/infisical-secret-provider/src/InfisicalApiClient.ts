import { InfisicalNotConfiguredError } from "./InfisicalNotConfiguredError";

/**
 * Options for the Infisical HTTP client.
 */
export interface InfisicalApiClientOptions {
    apiUrl?: string;
    token?: string;
    projectId?: string;
    environment?: string;
    secretPath?: string;
    fetchImpl?: typeof fetch;
}

/**
 * Raw secret payload returned by Infisical v3 raw endpoints.
 */
export interface InfisicalRawSecret {
    secretKey: string;
    secretValue: string;
    createdAt?: string;
    updatedAt?: string;
}

/**
 * HTTP client for Infisical v3 raw secret endpoints.
 */
export class InfisicalApiClient {
    private readonly apiUrl: string;
    private readonly token: string;
    private readonly projectId: string;
    private readonly environment: string;
    private readonly secretPath: string;
    private readonly fetchImpl: typeof fetch;

    /**
     * Creates an Infisical API client.
     *
     * @param options Infisical connection options
     */
    constructor(options: InfisicalApiClientOptions = {}) {
        this.apiUrl = (options.apiUrl ?? process.env.INFISICAL_API_URL ?? "https://app.infisical.com").replace(/\/+$/, "");
        this.token = options.token ?? process.env.INFISICAL_TOKEN ?? "";
        this.projectId = options.projectId ?? process.env.INFISICAL_PROJECT_ID ?? "";
        this.environment = options.environment ?? process.env.INFISICAL_ENVIRONMENT ?? "dev";
        this.secretPath = options.secretPath ?? process.env.INFISICAL_SECRET_PATH ?? "/";
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    /**
     * Returns whether the client has enough configuration to call Infisical.
     *
     * @returns True when token, project id, and environment are set
     */
    isConfigured(): boolean {
        return this.token.length > 0 && this.projectId.length > 0 && this.environment.length > 0;
    }

    /**
     * Lists raw secrets from Infisical for the configured project and environment.
     *
     * @returns Raw secret entries
     */
    async listSecrets(): Promise<InfisicalRawSecret[]> {
        this.assertConfigured();
        const query = this.buildQuery({
            workspaceId: this.projectId,
            environment: this.environment,
            secretPath: this.secretPath,
            recursive: "true"
        });
        const response = await this.request("GET", `/api/v3/secrets/raw?${query}`);
        const payload = await this.readJson(response) as { secrets?: InfisicalRawSecret[] };
        return payload.secrets ?? [];
    }

    /**
     * Reads a single raw secret by key from Infisical.
     *
     * @param secretName Infisical secret key
     * @returns Raw secret payload
     */
    async getSecret(secretName: string): Promise<InfisicalRawSecret> {
        this.assertConfigured();
        const query = this.buildQuery({
            workspaceId: this.projectId,
            environment: this.environment,
            secretPath: this.secretPath
        });
        const response = await this.request("GET", `/api/v3/secrets/raw/${encodeURIComponent(secretName)}?${query}`);

        if (response.status === 404) {
            throw new Error(`Secret not found: ${secretName}`);
        }

        const payload = await this.readJson(response) as { secret?: InfisicalRawSecret };
        const secret = payload.secret;

        if (!secret) {
            throw new Error(`Secret not found: ${secretName}`);
        }

        return secret;
    }

    /**
     * Creates a raw secret in Infisical.
     *
     * @param secretName Infisical secret key
     * @param secretValue Secret value
     * @returns Created raw secret payload
     */
    async createSecret(secretName: string, secretValue: string): Promise<InfisicalRawSecret> {
        this.assertConfigured();
        const response = await this.request("POST", `/api/v3/secrets/raw/${encodeURIComponent(secretName)}`, {
            workspaceId: this.projectId,
            environment: this.environment,
            secretPath: this.secretPath,
            secretValue
        });
        const payload = await this.readJson(response) as { secret?: InfisicalRawSecret };
        const secret = payload.secret;

        if (!secret) {
            throw new Error(`Infisical create secret failed for ${secretName}`);
        }

        return secret;
    }

    /**
     * Updates a raw secret in Infisical.
     *
     * @param secretName Infisical secret key
     * @param secretValue Secret value
     * @returns Updated raw secret payload
     */
    async updateSecret(secretName: string, secretValue: string): Promise<InfisicalRawSecret> {
        this.assertConfigured();
        const response = await this.request("PATCH", `/api/v3/secrets/raw/${encodeURIComponent(secretName)}`, {
            workspaceId: this.projectId,
            environment: this.environment,
            secretPath: this.secretPath,
            secretValue
        });
        const payload = await this.readJson(response) as { secret?: InfisicalRawSecret };
        const secret = payload.secret;

        if (!secret) {
            throw new Error(`Infisical update secret failed for ${secretName}`);
        }

        return secret;
    }

    /**
     * Deletes a raw secret from Infisical.
     *
     * @param secretName Infisical secret key
     * @returns Nothing.
     */
    async deleteSecret(secretName: string): Promise<void> {
        this.assertConfigured();
        const response = await this.request("DELETE", `/api/v3/secrets/${encodeURIComponent(secretName)}`, {
            workspaceId: this.projectId,
            environment: this.environment,
            secretPath: this.secretPath
        });

        if (response.status === 404) {
            return;
        }

        await this.readJson(response);
    }

    /**
     * Ensures the client is configured before making API calls.
     *
     * @returns Nothing.
     */
    private assertConfigured(): void {
        if (!this.isConfigured()) {
            throw new InfisicalNotConfiguredError();
        }
    }

    /**
     * Executes an authenticated Infisical API request.
     *
     * @param method HTTP method
     * @param path API path including query string
     * @param body Optional JSON request body
     * @returns Fetch response
     */
    private async request(method: string, path: string, body?: Record<string, unknown>): Promise<Response> {
        console.debug(
            "[plugin-infisical] request method=%s path=%s projectId=%s environment=%s",
            method,
            path,
            this.projectId,
            this.environment
        );

        const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${this.resolveAuthToken(this.token)}`,
                "Content-Type": "application/json"
            },
            body: body ? JSON.stringify(body) : undefined
        });

        if (!response.ok && response.status !== 404) {
            const detail = await response.text();
            throw new Error(`Infisical API ${method} ${path} failed with status ${response.status}: ${detail}`);
        }

        return response;
    }

    /**
     * Parses a JSON response body when present.
     *
     * @param response Fetch response
     * @returns Parsed JSON payload
     */
    private async readJson(response: Response): Promise<unknown> {
        const text = await response.text();

        if (text.length === 0) {
            return {};
        }

        return JSON.parse(text) as unknown;
    }

    /**
     * Builds a URL query string from key/value pairs.
     *
     * @param params Query parameters
     * @returns Encoded query string
     */
    private buildQuery(params: Record<string, string>): string {
        return new URLSearchParams(params).toString();
    }

    /**
     * Normalizes Infisical service tokens to the access-token portion.
     *
     * @param token Raw token from configuration
     * @returns Authorization bearer token
     */
    private resolveAuthToken(token: string): string {
        if (token.startsWith("st.") && token.includes(".")) {
            return token.slice(0, token.lastIndexOf("."));
        }

        return token;
    }
}
