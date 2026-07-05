import {
    isContainerRegistryRef,
    isNauliteCrDockerRef,
    parseContainerRegistryRef,
    resolveContainerRegistryImageRef,
    resolveDockerBuildTag,
    resolveNauliteCrDockerRef,
    toContainerRegistryRef,
    toCrPullSpec
} from "@naulite/shared";
import { describe, expect, it } from "vitest";

describe("resolveContainerRegistryImageRef", () => {
    it("detects container registry refs", () => {
        expect(isContainerRegistryRef("container-registry://api:latest")).toBe(true);
        expect(isContainerRegistryRef("nginx:alpine")).toBe(false);
    });

    it("parses and builds container registry refs", () => {
        expect(parseContainerRegistryRef("container-registry://demo-api:v1")).toEqual({
            name: "demo-api",
            tag: "v1"
        });
        expect(toContainerRegistryRef("demo-api", "v1")).toBe("container-registry://demo-api:v1");
        expect(toCrPullSpec("container-registry://demo-api:v1")).toEqual({
            name: "demo-api",
            tag: "v1"
        });
    });

    it("resolves manifest service naming conventions", () => {
        expect(resolveContainerRegistryImageRef("demo", "api")).toBe("container-registry://demo-api:latest");
        expect(resolveDockerBuildTag("demo", "api")).toBe("naulite/demo-api:latest");
        expect(resolveNauliteCrDockerRef("demo", "api")).toBe("naulite-cr/demo-api:latest");
    });

    it("detects naulite-cr docker refs", () => {
        expect(isNauliteCrDockerRef("naulite-cr/demo-api:latest")).toBe(true);
        expect(isNauliteCrDockerRef("naulite/demo-api:latest")).toBe(false);
    });
});
