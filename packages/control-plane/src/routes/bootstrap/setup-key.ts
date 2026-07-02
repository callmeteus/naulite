import { isLocalBootstrapRequest } from "../../bootstrap/BootstrapUrls";
import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    async handler(req, res) {
        if (!isLocalBootstrapRequest(req)) {
            res.code(403);
            return { message: "Forbidden." };
        }

        const setupKey = await ControlPlaneService.Enrollment.ensureSetupKey();

        return { setupKey };
    }
});
