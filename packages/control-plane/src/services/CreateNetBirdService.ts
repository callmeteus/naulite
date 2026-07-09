import type { NetBirdCredentials } from "./NetBirdBootstrap";
import { NetBirdConfig } from "./NetBirdConfig";
import { MockNetBirdAdapter, NetBirdService } from "./NetBirdService";
import { SelfHostedNetBirdAdapter } from "./SelfHostedNetBirdAdapter";

/**
 * Creates the NetBird adapter for the control plane.
 *
 * @param credentials Optional bootstrapped NetBird credentials
 * @returns NetBird adapter wired to self-hosted API or test mock
 */
export function createNetBirdAdapter(credentials?: NetBirdCredentials) {
    if (NetBirdConfig.useMockAdapter()) {
        return new MockNetBirdAdapter();
    }

    const apiUrl = NetBirdConfig.resolveApiUrl();
    const token = credentials?.apiToken ?? process.env.NETBIRD_TOKEN;

    return new SelfHostedNetBirdAdapter({
        apiUrl,
        token
    });
}

/**
 * Creates the NetBird service for the control plane.
 *
 * @param credentials Optional bootstrapped NetBird credentials
 * @returns NetBird service wired to self-hosted API or test mock
 */
export function createNetBirdService(credentials?: NetBirdCredentials): NetBirdService {
    return new NetBirdService(createNetBirdAdapter(credentials));
}
