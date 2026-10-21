import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { GeneratorItemService } from "../../../packages/control-plane/src/services/pipeline/GeneratorItemService";

describe("GeneratorItemService", () => {
    const roots: string[] = [];

    afterEach(() => {
        roots.length = 0;
    });

    it("expands directories with values file and selector", () => {
        const root = join(tmpdir(), `gen-${Date.now()}`);
        roots.push(root);
        const tenantDir = join(root, "mania");
        mkdirSync(tenantDir, {
            recursive: true
        });
        writeFileSync(join(tenantDir, "tenant.yml"), "active: true\nbranches:\n  default: master\ndeploy:\n  target: true\n  level: crucial\n");

        const items = GeneratorItemService.expandGenerator({
            name: "apps",
            git: {
                directories: {
                    path: root,
                    exclude: []
                }
            },
            valuesFile: "tenant.yml",
            selector: {
                matchExpressions: [
                    {
                        key: "values.deploy.level",
                        operator: "NotIn",
                        values: ["ignore"]
                    }
                ]
            }
        }, {
            BRANCH: "master"
        });

        expect(items).toHaveLength(1);
        expect(items[0].name).toBe("mania");
    });

    it("skips directories without values file", () => {
        const root = join(tmpdir(), `gen-skip-${Date.now()}`);
        roots.push(root);
        mkdirSync(join(root, "empty"), {
            recursive: true
        });

        const items = GeneratorItemService.expandGenerator({
            name: "apps",
            git: {
                directories: {
                    path: root,
                    exclude: []
                }
            },
            valuesFile: "tenant.yml"
        }, {
            BRANCH: "master"
        });

        expect(items).toHaveLength(0);
    });
});
