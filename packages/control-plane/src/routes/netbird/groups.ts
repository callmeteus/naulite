import { z } from "zod";

import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    async handler() {
        return {
            groups: await ControlPlaneService.NetBird.listGroups()
        };
    }
});

export const POST = defineRoute({
    async handler(req) {
        const body = z.object({
            name: z.string().min(1)
        }).parse(req.body);

        return {
            group: await ControlPlaneService.NetBird.ensureInternalGroup(body.name)
        };
    }
});
