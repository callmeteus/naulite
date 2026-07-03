import type { z } from "zod";

import {
    NodeProvisionSchema,
    NodeProvisionStatusSchema
} from "../schemas/NodeProvision";

export type NodeProvisionStatus = z.infer<typeof NodeProvisionStatusSchema>;
export type NodeProvision = z.infer<typeof NodeProvisionSchema>;
