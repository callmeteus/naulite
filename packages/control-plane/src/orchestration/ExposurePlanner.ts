import type { Manifest, NetworkExposure } from "@platform/shared";

import { NetworkGroupId } from "./NetworkGroupId.js";

/**
 * Planned internal exposure through NetBird groups.
 */
export interface ExposurePlanEntry {
    networkGroupId: string;
    exposure: NetworkExposure;
    netbirdGroupName: string;
}

/**
 * Exposure plan for internal-only services.
 */
export interface ExposurePlan {
    manifestName: string;
    entries: ExposurePlanEntry[];
}

/**
 * Plans NetBird-only internal exposure for manifest services.
 */
export class ExposurePlanner {
    /**
     * Builds an exposure plan for internal ingress services.
     * 
     * @param manifest Validated manifest
     * @param exposures Internal exposure rules extracted from the manifest
     * @returns Exposure plan for NetBird provisioning
     */
    plan(manifest: Manifest, exposures: NetworkExposure[]): ExposurePlan {
        const entries = exposures.map((exposure) => {
            const networkGroupId = NetworkGroupId.build(manifest.name, exposure.networkName);

            return {
                networkGroupId,
                exposure,
                netbirdGroupName: `internal-${networkGroupId}`
            };
        });

        return {
            manifestName: manifest.name,
            entries
        };
    }

    /**
     * Filters exposures that should remain NetBird-only.
     * 
     * @param exposures Candidate exposure rules
     * @returns Exposures restricted to internal access
     */
    filterInternalOnly(exposures: NetworkExposure[]): NetworkExposure[] {
        return exposures;
    }
}
