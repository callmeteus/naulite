import { z } from "zod";

import { LooseObjectArraySchema } from "./LooseObjectArraySchema";

/**
 * NetBird ACL list response payload.
 */
export const NetBirdAclsListResponseSchema = z.object({
    acls: LooseObjectArraySchema
});
