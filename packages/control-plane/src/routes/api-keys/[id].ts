import { z } from "zod";

import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

export const DELETE = defineRoute({
    preHandler: AuthPreHandlers.checkAuthorized({ allowLocalBootstrapRequest: true }),
    async handler(req, res) {
        const params = z.object({ id: z.string().min(1) }).parse(req.params);
        const revoked = await ControlPlaneService.Store.revokeApiKey(params.id);

        if (!revoked) {
            res.code(404);
            return { message: "API key not found." };
        }

        return { revoked: true };
    }
});
