import type { z } from "zod";

import {
    ServiceSchema,
    ServiceStatusSchema
} from "../schemas/Service.js";

export type Service = z.infer<typeof ServiceSchema>;
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;
