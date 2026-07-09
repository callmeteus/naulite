import type { z } from "zod";

import type {
    VolumeSchema,
    VolumeStatusSchema
} from "../schemas/Volume";

export type Volume = z.infer<typeof VolumeSchema>;
export type VolumeStatus = z.infer<typeof VolumeStatusSchema>;
