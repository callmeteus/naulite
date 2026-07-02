import { z } from "zod";

import { LooseObjectArraySchema } from "./LooseObjectArraySchema";

/**
 * NetBird device list response payload.
 */
export const NetBirdDevicesListResponseSchema = z.object({
    devices: LooseObjectArraySchema
});
