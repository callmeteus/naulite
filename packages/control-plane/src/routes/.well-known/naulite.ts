import { defineRoute } from "../../routing/DefineRoute";
import { NauliteMetadataResponseSchema } from "@naulite/shared";

export const GET = defineRoute({
    schema: {
        summary: "Naulite metadata",
        description: "Exposes public control plane metadata for client discovery.",
        tags: ["well-known"],
        operationId: "getNauliteMetadata",
        response: {
            200: NauliteMetadataResponseSchema
        }
    },
    data: {
        name: "naulite",
        version: "0.1.0",
        authRequired: true,
        defaultPort: 8080,
        localBypass: true
    }
});
