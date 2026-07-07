import { z } from "zod";

import { LooseObjectSchema } from "./LooseObjectSchema";

/**
 * Array of open objects for list endpoints with heterogeneous records.
 */
export const LooseObjectArraySchema = z.array(LooseObjectSchema);
