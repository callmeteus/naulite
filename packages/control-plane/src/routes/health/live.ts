import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    handler() {
        return { status: "ok" };
    }
});
