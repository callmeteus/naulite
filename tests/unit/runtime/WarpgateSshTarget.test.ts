import { WarpgateSshTarget } from "../../../packages/control-plane/src/runtime/WarpgateSshTarget";
import { describe, expect, it } from "vitest";

describe("WarpgateSshTarget", () => {
    it("formats ubuntu:target@warpgate host with port 2222", () => {
        const argv = WarpgateSshTarget.buildSshArgv({
            username: "ubuntu",
            host: "warpgate.arpa",
            port: 2222,
            targetName: "vm.prod.pdm"
        });

        expect(argv).toEqual([
            "ssh",
            "-p",
            "2222",
            "ubuntu:vm.prod.pdm@warpgate.arpa"
        ]);
    });
});
