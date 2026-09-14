import { HostSessionPath } from "../../../packages/control-plane/src/runtime/HostSessionPath";
import { describe, expect, it } from "vitest";

describe("HostSessionPath", () => {
    it("finds node on PATH after nvm install", () => {
        const session = HostSessionPath.create();
        HostSessionPath.applyNvmInstall(session, "25");

        expect(HostSessionPath.hasNodeOnPath(session)).toBe(true);
    });

    it("reports missing node before nvm", () => {
        const session = HostSessionPath.create();

        expect(HostSessionPath.hasNodeOnPath(session)).toBe(false);
    });
});
