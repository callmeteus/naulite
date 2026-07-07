import type { z } from "zod";

import { RegistrySchema } from "../schemas/Registry";

export type Registry = z.infer<typeof RegistrySchema>;
