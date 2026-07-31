import { describe, expect, it } from "vitest";

import { resolveKnownApiErrorI18n } from "../../../packages/nodejs/shared/src/util/resolveKnownApiErrorI18n";

describe("resolveKnownApiErrorI18n", () => {
    it("maps legacy Portuguese agent forward errors to i18n keys", () => {
        expect(resolveKnownApiErrorI18n({
            message: "Falha ao encaminhar requisição ao agente."
        })).toEqual({
            i18n: "errors.agentForwardFailed"
        });
    });

    it("maps agent request failures with HTTP status params", () => {
        expect(resolveKnownApiErrorI18n({
            code: "AGENT_REQUEST_FAILED",
            message: "Agent request failed with HTTP 503."
        })).toEqual({
            i18n: "errors.agentRequestFailed",
            i18nParams: {
                status: "503"
            }
        });
    });

    it("preserves explicit i18n keys from the API", () => {
        expect(resolveKnownApiErrorI18n({
            i18n: "errors.nodeNotFound",
            i18nParams: { nodeId: "dev-local" },
            message: "ignored"
        })).toEqual({
            i18n: "errors.nodeNotFound",
            i18nParams: { nodeId: "dev-local" }
        });
    });
});
