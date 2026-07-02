import { MockNetBirdAdapter, NetBirdService } from "./NetBirdService";
import { NetBirdConfig } from "./NetBirdConfig";
import type { NetBirdCredentials } from "./NetBirdBootstrap";
import { SelfHostedNetBirdAdapter } from "./SelfHostedNetBirdAdapter";

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
