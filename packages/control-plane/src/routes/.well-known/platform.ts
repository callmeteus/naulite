import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    data: {
        name: "platform",
        version: "0.1.0",
        authRequired: true,
        defaultPort: 8080,
        localBypass: true
    }
});
