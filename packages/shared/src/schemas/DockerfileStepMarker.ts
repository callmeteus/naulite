import { z } from "zod";

/**
 * @todo rename platform prefix after final platform name is chosen
 * Parsed Dockerfile step marker name (`# platform:step <name>`).
 */
export const DockerfileStepNameSchema = z.string().regex(
    /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/,
    "Step name must be kebab-case (a-z, 0-9, hyphen)."
);

/**
 * Dockerfile step marker discovered by the agent parser.
 */
export const DockerfileStepMarkerSchema = z.object({
    name: DockerfileStepNameSchema,
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive()
});

/**
 * @todo rename platform prefix after final platform name is chosen
 * Exact comment prefix scanned in Dockerfiles.
 */
export const DOCKERFILE_STEP_COMMENT_PREFIX = "# platform:step ";
