import type { z } from "zod";

import type { RegistrySchema } from "../schemas/Registry";

export type Registry = z.infer<typeof RegistrySchema>;
