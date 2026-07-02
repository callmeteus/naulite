import type { z } from "zod";

import { SecretSchema } from "../schemas/Secret.js";

export type Secret = z.infer<typeof SecretSchema>;
