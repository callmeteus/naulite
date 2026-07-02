import { MockNetBirdAdapter, NetBirdService } from "./NetBirdService.js";
import { NetBirdConfig } from "./NetBirdConfig.js";
import type { NetBirdCredentials } from "./NetBirdBootstrap.js";
import { SelfHostedNetBirdAdapter } from "./SelfHostedNetBirdAdapter.js";

/**
 * Creates the NetBird service for the control plane.
 * 
 * @param credentials Optional bootstrapped NetBird credentials
 * @returns NetBird service wired to self-hosted API or test mock
 */
export function createNetBirdService(credentials?: NetBirdCredentials): NetBirdService {
    if (NetBirdConfig.useMockAdapter()) {
        return new NetBirdService(new MockNetBirdAdapter());
    }

    const apiUrl = NetBirdConfig.resolveApiUrl();
    const token = credentials?.apiToken ?? process.env.NETBIRD_TOKEN;

    return new NetBirdService(new SelfHostedNetBirdAdapter({
        apiUrl,
        token
    }));
}
