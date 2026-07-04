/**
 * Environment variable names checked for each notification provider plugin.
 */
const NOTIFICATION_PROVIDER_ENV: Record<string, {
    urlVars: string[];
    secretVars: string[];
}> = {
    slack: {
        urlVars: ["PLATFORM_SLACK_WEBHOOK_URL", "SLACK_WEBHOOK_URL"],
        secretVars: []
    },
    webhook: {
        urlVars: ["PLATFORM_WEBHOOK_URL", "WEBHOOK_URL"],
        secretVars: ["PLATFORM_WEBHOOK_SECRET"]
    }
};

/**
 * Provider status returned by notification management routes.
 */
export interface NotificationProviderStatus {
    id: string;
    type: "notification";
    registered: boolean;
    urlConfigured: boolean;
    secretConfigured: boolean;
    env: {
        urlVars: string[];
        secretVars: string[];
    };
}

/**
 * Resolves notification provider configuration status from environment variables.
 */
export namespace NotificationProviderEnvStatus {
    /**
     * Returns whether any of the configured environment variables is set.
     *
     * @param names Environment variable names
     * @returns True when at least one variable is non-empty
     */
    export function isAnyEnvSet(names: string[]): boolean {
        return names.some((name) => Boolean(process.env[name]?.trim()));
    }

    /**
     * Builds provider status entries for the given plugin ids.
     *
     * @param providerIds Registered notification provider ids
     * @returns Provider status list
     */
    export function list(providerIds: string[]): NotificationProviderStatus[] {
        return providerIds
            .sort((left, right) => left.localeCompare(right))
            .map((id) => {
                const env = NOTIFICATION_PROVIDER_ENV[id] ?? {
                    urlVars: [],
                    secretVars: []
                };

                return {
                    id,
                    type: "notification" as const,
                    registered: true,
                    urlConfigured: isAnyEnvSet(env.urlVars),
                    secretConfigured: env.secretVars.length === 0
                        || isAnyEnvSet(env.secretVars),
                    env
                };
            });
    }
}
