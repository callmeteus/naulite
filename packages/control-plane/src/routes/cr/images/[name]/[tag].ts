import type { FastifyRequest } from "fastify";
import { Readable } from "node:stream";

import { ControlPlaneService } from "../../../../ControlPlaneService";
import { PermissionPreHandlers } from "../../../../auth/PermissionPreHandlers";
import { HTTP400Error } from "../../../../errors/TreatedError";
import { defineRoute } from "../../../../routing/DefineRoute";
import {
    CrImageDeleteResponseSchema,
    CrImageNameTagParamsSchema,
    CrImagePushResponseSchema,
    RouteErrorResponseSchema
} from "@naulite/shared";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("registry:read"),
    schema: {
        summary: "Pull container registry image",
        description: "Proxies a docker save tarball stream for the requested image.",
        tags: ["container-registry"],
        operationId: "getContainerRegistryImage",
        params: CrImageNameTagParamsSchema,
        response: {
            404: RouteErrorResponseSchema
        }
    },
    async handler(req, res) {
        const { name, tag } = req.params;

        try {
            const { image, stream } = await ControlPlaneService.ContainerRegistry.getImageStream(name, tag);
            res.header("Content-Type", "application/octet-stream");
            res.header("Content-Length", String(image.sizeBytes));
            res.header("Digest", image.digest);
            return res.send(stream);
        } catch (err) {
            console.debug("[container-registry] get failed name=%s tag=%s err=%o", name, tag, err);
            return res.status(404).send({
                error: "not_found",
                message: `Container image ${name}:${tag} not found.`
            });
        }
    }
});

export const HEAD = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("registry:read"),
    schema: {
        summary: "Head container registry image",
        description: "Returns metadata headers for a stored container image blob.",
        tags: ["container-registry"],
        operationId: "headContainerRegistryImage",
        params: CrImageNameTagParamsSchema,
        response: {
            404: RouteErrorResponseSchema
        }
    },
    async handler(req, res) {
        const { name, tag } = req.params;
        const head = await ControlPlaneService.ContainerRegistry.headImage(name, tag);

        if (!head) {
            return res.status(404).send({
                error: "not_found",
                message: `Container image ${name}:${tag} not found.`
            });
        }

        res.header("Content-Type", head.contentType);
        res.header("Content-Length", String(head.sizeBytes));
        res.header("Digest", head.digest);
        return res.status(200).send();
    }
});

export const PUT = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("registry:write"),
    schema: {
        summary: "Push container registry image",
        description: "Proxies an upload stream and stores a docker save tarball for the requested image.",
        tags: ["container-registry"],
        operationId: "putContainerRegistryImage",
        params: CrImageNameTagParamsSchema,
        response: {
            201: CrImagePushResponseSchema
        }
    },
    async handler(req, res) {
        const { name, tag } = req.params;
        const body = resolveUploadStream(req);
        const image = await ControlPlaneService.ContainerRegistry.putImage(name, tag, body);
        return res.status(201).send(image);
    }
});

/**
 * Resolves the upload stream from a proxied HTTP request or buffered test payload.
 *
 * @param req Incoming Fastify request
 * @returns Readable upload body
 */
function resolveUploadStream(req: FastifyRequest): Readable {
    if (req.raw.readable && !req.raw.readableEnded) {
        return req.raw;
    }

    if (Buffer.isBuffer(req.body)) {
        return Readable.from(req.body);
    }

    if (typeof req.body === "string") {
        return Readable.from([Buffer.from(req.body)]);
    }

    throw new HTTP400Error("Missing upload body.");
}

export const DELETE = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("registry:write"),
    schema: {
        summary: "Delete container registry image",
        description: "Deletes image metadata and the backing blob from the configured destination.",
        tags: ["container-registry"],
        operationId: "deleteContainerRegistryImage",
        params: CrImageNameTagParamsSchema,
        response: {
            200: CrImageDeleteResponseSchema,
            404: RouteErrorResponseSchema
        }
    },
    async handler(req, res) {
        const { name, tag } = req.params;
        const deleted = await ControlPlaneService.ContainerRegistry.deleteImage(name, tag);

        if (!deleted) {
            return res.status(404).send({
                error: "not_found",
                message: `Container image ${name}:${tag} not found.`
            });
        }

        return { deleted: true, name, tag };
    }
});
