import type { z } from "zod";

import {
    NetworkExposureSchema,
    NetworkSchema
} from "../schemas/Network";

export type Network = z.infer<typeof NetworkSchema>;
export type NetworkExposure = z.infer<typeof NetworkExposureSchema>;
