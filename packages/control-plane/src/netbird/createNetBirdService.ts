import { MockNetBirdAdapter, NetBirdService } from "./NetBirdService.js";
import { NetBirdConfig } from "./NetBirdConfig.js";
import { SelfHostedNetBirdAdapter } from "./SelfHostedNetBirdAdapter.js";

/**
 * Creates the NetBird service for the control plane.
 * 
 * @returns NetBird service wired to self-hosted API or test mock
 */
export function createNetBirdService(): NetBirdService {
    if (NetBirdConfig.useMockAdapter()) {
        return new NetBirdService(new MockNetBirdAdapter());
    }

    const apiUrl = NetBirdConfig.resolveApiUrl();

    return new NetBirdService(new SelfHostedNetBirdAdapter({
        apiUrl,
        token: process.env.NETBIRD_TOKEN
    }));
}
