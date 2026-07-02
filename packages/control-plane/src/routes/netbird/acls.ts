import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    async handler() {
        return {
            acls: await ControlPlaneService.NetBird.listAcls()
        };
    }
});
