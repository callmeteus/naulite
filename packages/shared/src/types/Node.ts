import type { z } from "zod";

import {
    NodeResourcesSchema,
    NodeSchema,
    NodeStatusSchema
} from "../schemas/Node.js";

export type Node = z.infer<typeof NodeSchema>;
export type NodeStatus = z.infer<typeof NodeStatusSchema>;
export type NodeResources = z.infer<typeof NodeResourcesSchema>;
