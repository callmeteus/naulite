import { describe, expect, it, vi } from "vitest";

import { ControlPlaneService } from "../../../packages/control-plane/src/ControlPlaneService";
import { DELETE } from "../../../packages/control-plane/src/routes/nodes/[id]";

describe("DELETE /nodes/:id", () => {
    it("returns deleted payload when the store removes the node", async () => {
        const deleteNode = vi.spyOn(ControlPlaneService.Store, "deleteNode").mockResolvedValue(true);

        const result = await DELETE.handler(
            { params: { id: "node-1" } } as never,
            { code: vi.fn() } as never
        );

        expect(deleteNode).toHaveBeenCalledWith("node-1");
        expect(result).toEqual({ deleted: true, id: "node-1" });

        deleteNode.mockRestore();
    });

    it("returns 404 when the node does not exist", async () => {
        const deleteNode = vi.spyOn(ControlPlaneService.Store, "deleteNode").mockResolvedValue(false);
        const code = vi.fn();

        const result = await DELETE.handler(
            { params: { id: "missing" } } as never,
            { code } as never
        );

        expect(code).toHaveBeenCalledWith(404);
        expect(result).toEqual({ message: "Node not found." });

        deleteNode.mockRestore();
    });
});
