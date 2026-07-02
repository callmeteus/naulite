import { z } from "zod";

import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    async handler(req, res) {
        const routeParams = z.object({ id: z.string().min(1) }).parse(req.params);
        const node = await ControlPlaneService.Store.getNode(routeParams.id);

        if (!node) {
            res.code(404);
            return { message: "Node not found." };
        }

        return node;
    }
});
