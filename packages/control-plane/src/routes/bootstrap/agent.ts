import {
    resolvePublicControlPlaneUrl,
    resolvePublicNetBirdManagementUrl
} from "../../bootstrap/BootstrapUrls";
import { ControlPlaneService } from "../../ControlPlaneService";
import { HTTP401Error, HTTP403Error, HTTP503Error } from "../../errors/TreatedError";
import { defineRoute } from "../../routing/DefineRoute";

const SETUP_KEY_SECRET_NAME = "netbird/setup-key";

export const GET = defineRoute({
    async handler(req) {
        const headerKey = req.headers["x-platform-setup-key"];
        const setupKey = typeof headerKey === "string" ? headerKey.trim() : "";

        if (!setupKey) {
            throw new HTTP401Error("Missing setup key.");
        }

        const stored = await ControlPlaneService.Store.getClusterSecretValues(SETUP_KEY_SECRET_NAME);

        if (!stored?.key || stored.key !== setupKey) {
            throw new HTTP403Error("Invalid setup key.");
        }

        const netbirdManagementUrl = resolvePublicNetBirdManagementUrl();

        if (!netbirdManagementUrl) {
            throw new HTTP503Error("NetBird management URL is not configured.");
        }

        return {
            cpUrl: resolvePublicControlPlaneUrl(req),
            netbirdManagementUrl
        };
    }
});
