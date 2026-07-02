import type { z } from "zod";

import { SecretSchema } from "../schemas/Secret";

export type Secret = z.infer<typeof SecretSchema>;
