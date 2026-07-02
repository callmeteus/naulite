import type { ApiKeySchema, CreatedApiKeySchema } from "../schemas/ApiKeySchema.js";
import type { z } from "zod";

export type ApiKey = z.infer<typeof ApiKeySchema>;
export type CreatedApiKey = z.infer<typeof CreatedApiKeySchema>;
