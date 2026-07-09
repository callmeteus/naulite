import type { z } from "zod";
import type { ApiKeySchema, CreatedApiKeySchema } from "../schemas/ApiKeySchema";

export type ApiKey = z.infer<typeof ApiKeySchema>;
export type CreatedApiKey = z.infer<typeof CreatedApiKeySchema>;
