import { z } from "zod";

/**
 * Open object schema for dynamic agent or orchestration responses.
 */
export const LooseObjectSchema = z.object({}).passthrough();
