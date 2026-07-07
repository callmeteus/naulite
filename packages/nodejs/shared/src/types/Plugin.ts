import type { z } from "zod";

import {
    PluginRegistrationSchema,
    PluginSchema,
    PluginTypeSchema
} from "../schemas/Plugin";

export type PluginType = z.infer<typeof PluginTypeSchema>;
export type Plugin = z.infer<typeof PluginSchema>;
export type PluginRegistration = z.infer<typeof PluginRegistrationSchema>;
