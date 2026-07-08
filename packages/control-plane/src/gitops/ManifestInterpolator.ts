export namespace ManifestInterpolator {
    const VAR_PATTERN = /\$\{([A-Z0-9_]+)(:-([^}]*))?\}/g;

    export interface InterpolateOptions {
        /**
         * The variables to interpolate.
         */
        vars: Record<string, string>;

        /**
         * When true, `${VAR}` without a value throws.
         * `${VAR:-default}` never throws.
         */
        strict?: boolean;
    }

    /**
     * Interpolates `${VAR}` / `${VAR:-default}` in all string values.
     * Does not modify object keys.
     * 
     * @param value The value to interpolate.
     * @param options The options for the interpolation.
     * @returns The interpolated value.
     */
    export function interpolate(value: unknown, options: InterpolateOptions): unknown {
        if (typeof value === "string") {
            return interpolateString(value, options);
        }

        if (Array.isArray(value)) {
            return value.map((v) => interpolate(v, options));
        }

        if (value && typeof value === "object") {
            const input = value as Record<string, unknown>;
            const out: Record<string, unknown> = {};

            for (const [k, v] of Object.entries(input)) {
                out[k] = interpolate(v, options);
            }

            return out;
        }

        return value;
    }

    /**
     * Interpolates `${VAR}` / `${VAR:-default}` in a string.
     * 
     * @param input The string to interpolate.
     * @param options The options for the interpolation.
     * @returns The interpolated string.
     */
    export function interpolateString(input: string, options: InterpolateOptions): string {
        return input.replace(VAR_PATTERN, (_full, name: string, _defaultGroup: string | undefined, defaultValue: string | undefined) => {
            const raw = options.vars[name];

            if (raw !== undefined && raw !== null && raw !== "") {
                return raw;
            }

            if (defaultValue !== undefined) {
                return defaultValue;
            }

            if (options.strict ?? true) {
                throw new Error(`Variável obrigatória não definida: ${name}`);
            }

            return "";
        });
    }

    /**
     * Coerces well-known numeric fields after interpolation so Zod validation
     * doesn't fail due to `"5"` being a string.
     * 
     * @param manifestLike The manifest to coerce.
     * @returns The coerced manifest.
     */
    export function coerceNumericFields(manifestLike: unknown): unknown {
        if (!manifestLike || typeof manifestLike !== "object" || Array.isArray(manifestLike)) {
            return manifestLike;
        }

        const doc = manifestLike as Record<string, unknown>;
        const services = doc.services;

        if (!services || typeof services !== "object" || Array.isArray(services)) {
            return manifestLike;
        }

        const out: Record<string, unknown> = { ...doc };
        const outServices: Record<string, unknown> = { ...(services as Record<string, unknown>) };

        for (const [serviceName, rawService] of Object.entries(outServices)) {
            if (!rawService || typeof rawService !== "object" || Array.isArray(rawService)) {
                continue;
            }

            const service = rawService as Record<string, unknown>;
            const deploy = service.deploy;

            if (!deploy || typeof deploy !== "object" || Array.isArray(deploy)) {
                continue;
            }

            const deployObj = deploy as Record<string, unknown>;
            const replicas = deployObj.replicas;

            if (typeof replicas === "string" && replicas.trim() !== "") {
                const n = Number(replicas);
                if (Number.isInteger(n) && n > 0) {
                    outServices[serviceName] = {
                        ...service,
                        deploy: {
                            ...deployObj,
                            replicas: n
                        }
                    };
                }
            }
        }

        out.services = outServices;
        return out;
    }
}
