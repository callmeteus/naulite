import type { z } from "zod";

import type {
    IngressPathSchema,
    IngressSchema,
    IngressTlsSchema
} from "../schemas/Ingress";

export type Ingress = z.infer<typeof IngressSchema>;
export type IngressTls = z.infer<typeof IngressTlsSchema>;
export type IngressPath = z.infer<typeof IngressPathSchema>;
