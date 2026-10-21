import { describe, expect, it, vi } from "vitest";

import { ControlPlaneService } from "../../../packages/control-plane/src/ControlPlaneService";
import { DELETE } from "../../../packages/control-plane/src/routes/nodes/provisions/[id]";

describe("DELETE /nodes/provisions/:id", () => {
    it("abandons the provision when the service succeeds", async () => {
        const abandonProvision = vi.spyOn(ControlPlaneService.NodeProvision, "abandonProvision").mockResolvedValue({
            deleted: true,
            id: "prov-1"
        });

        const result = await DELETE.handler({ params: { id: "prov-1" } } as never, {} as never);

        expect(abandonProvision).toHaveBeenCalledWith("prov-1");
        expect(result).toEqual({ deleted: true, id: "prov-1" });

        abandonProvision.mockRestore();
    });
});
