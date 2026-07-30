import type { z } from "zod";

import type {
    NodeOsFamilySchema,
    NodeResourcesSchema,
    NodeSchema,
    NodeStatusSchema
} from "../schemas/Node";

export type Node = z.infer<typeof NodeSchema>;
export type NodeStatus = z.infer<typeof NodeStatusSchema>;
export type NodeResources = z.infer<typeof NodeResourcesSchema>;
export type NodeOsFamily = z.infer<typeof NodeOsFamilySchema>;
