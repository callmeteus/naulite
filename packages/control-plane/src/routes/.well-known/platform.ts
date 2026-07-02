import { defineRoute } from "../../routing/DefineRoute";
import { PlatformMetadataResponseSchema } from "@platform/shared";

export const GET = defineRoute({
    schema: {
        summary: "Platform metadata",
        description: "Exposes public control plane metadata for client discovery.",
        tags: ["well-known"],
        operationId: "getPlatformMetadata",
        response: {
            200: PlatformMetadataResponseSchema
        }
    },
    data: {
        name: "platform",
        version: "0.1.0",
        authRequired: true,
        defaultPort: 8080,
        localBypass: true
    }
});
