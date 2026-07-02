import { z } from "zod";

import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

export const DELETE = defineRoute({
    async handler(req, res) {
        const routeParams = z.object({
            name: z.string().min(1)
        }).parse(req.params);
        const deleted = await ControlPlaneService.Store.deleteSecretByName(routeParams.name);

        if (!deleted) {
            return res.status(404).send({
                error: "not_found",
                message: `Secret ${routeParams.name} não encontrado.`
            });
        }

        return { deleted: true, name: routeParams.name };
    }
});
