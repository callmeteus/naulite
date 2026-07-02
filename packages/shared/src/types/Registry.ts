import type { z } from "zod";

import { RegistrySchema } from "../schemas/Registry.js";

export type Registry = z.infer<typeof RegistrySchema>;
