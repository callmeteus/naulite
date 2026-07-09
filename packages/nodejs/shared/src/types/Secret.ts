import type { z } from "zod";

import type { SecretSchema } from "../schemas/Secret";

export type Secret = z.infer<typeof SecretSchema>;
