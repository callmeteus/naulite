import type { z } from "zod";

import {
    ServiceDeploySpecSchema,
    ServiceSchema,
    ServiceStatusSchema
} from "../schemas/Service";

export type Service = z.infer<typeof ServiceSchema>;
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;
export type ServiceDeploySpec = z.infer<typeof ServiceDeploySpecSchema>;
