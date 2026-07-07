import { z } from "zod";

import { ClusterLabelsSchema } from "../ClusterLabels";

/**
 * Request body for POST /nodes/provision.
 */
export const ProvisionNodeBodySchema = z.object({
    provider: z.string().min(1).default("aws"),
    instanceType: z.string().min(1),
    amiId: z.string().min(1),
    labels: ClusterLabelsSchema.default({}),
    capabilities: z.array(z.string()).default([]),
    count: z.number().int().min(1).max(10).default(1),
    region: z.string().min(1).optional(),
    subnetId: z.string().min(1).optional(),
    securityGroupIds: z.array(z.string().min(1)).default([]),
    iamInstanceProfile: z.string().min(1).optional(),
    keyName: z.string().min(1).optional()
});
