import type { z } from "zod";

import {
    InstanceHealthSchema,
    InstanceSchema,
    InstanceStatusSchema
} from "../schemas/Instance";

export type Instance = z.infer<typeof InstanceSchema>;
export type InstanceStatus = z.infer<typeof InstanceStatusSchema>;
export type InstanceHealth = z.infer<typeof InstanceHealthSchema>;
