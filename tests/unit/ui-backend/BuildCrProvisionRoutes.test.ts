import { afterEach, describe, expect, it, vi } from "vitest";



import { PlatformClient } from "../../../packages/sdk/src/PlatformClient";

import { createApp } from "../../../packages/ui/packages/backend/src/App";



/**

 * Builds a mocked control plane client for BFF route tests.

 *

 * @returns Mocked platform client

 */

function createMockControlPlane(): PlatformClient {

    return {

        triggerBuild: vi.fn(async () => ({

            buildId: "build-1",

            status: "queued"

        })),

        listContainerRegistryImages: vi.fn(async () => [{

            name: "api",

            tag: "latest",

            digest: "sha256:abc",

            sizeBytes: 1024,

            destination: { provider: "local", path: "/var/lib/platform/cr" },

            location: "/var/lib/platform/cr/api/latest.tar",

            pushedAt: "2026-07-02T00:00:00.000Z"

        }]),

        deleteContainerRegistryImage: vi.fn(async () => ({

            deleted: true,

            name: "api",

            tag: "latest"

        })),

        provisionNode: vi.fn(async () => ({

            id: "provision-1",

            provider: "aws",

            status: "bootstrapping",

            instanceType: "t3.small",

            amiId: "ami-123",

            labels: {},

            capabilities: [],

            createdAt: "2026-07-02T00:00:00.000Z",

            updatedAt: "2026-07-02T00:00:00.000Z"

        }))

    } as unknown as PlatformClient;

}



describe("ui-backend build, container registry, and provision routes", () => {

    afterEach(() => {

        vi.clearAllMocks();

        delete process.env.ADMIN_API_KEY;

    });



    it("proxies build trigger requests", async () => {

        const controlPlane = createMockControlPlane();

        const app = await createApp({

            adminApiKey: "secret-key",

            logger: false

        });

        app.controlPlane = controlPlane;



        const response = await app.inject({

            method: "POST",

            url: "/build",

            headers: { authorization: "Bearer secret-key" },

            payload: {

                serviceName: "api",

                provider: "docker"

            }

        });

        expect(response.statusCode).toBe(200);

        expect(controlPlane.triggerBuild).toHaveBeenCalledWith({

            serviceName: "api",

            provider: "docker"

        });



        await app.close();

    });



    it("proxies container registry list and delete actions", async () => {

        const controlPlane = createMockControlPlane();

        const app = await createApp({

            adminApiKey: "secret-key",

            logger: false

        });

        app.controlPlane = controlPlane;



        const listResponse = await app.inject({

            method: "GET",

            url: "/cr/images",

            headers: { authorization: "Bearer secret-key" }

        });

        expect(listResponse.statusCode).toBe(200);

        expect(listResponse.json()).toEqual([{

            name: "api",

            tag: "latest",

            digest: "sha256:abc",

            sizeBytes: 1024,

            destination: { provider: "local", path: "/var/lib/platform/cr" },

            location: "/var/lib/platform/cr/api/latest.tar",

            pushedAt: "2026-07-02T00:00:00.000Z"

        }]);

        expect(controlPlane.listContainerRegistryImages).toHaveBeenCalled();



        const deleteResponse = await app.inject({

            method: "DELETE",

            url: "/cr/images/api/latest",

            headers: { authorization: "Bearer secret-key" }

        });

        expect(deleteResponse.statusCode).toBe(200);

        expect(controlPlane.deleteContainerRegistryImage).toHaveBeenCalledWith("api", "latest");



        await app.close();

    });



    it("proxies node provision requests", async () => {

        const controlPlane = createMockControlPlane();

        const app = await createApp({

            adminApiKey: "secret-key",

            logger: false

        });

        app.controlPlane = controlPlane;



        const response = await app.inject({

            method: "POST",

            url: "/nodes/provision",

            headers: { authorization: "Bearer secret-key" },

            payload: {

                provider: "aws",

                instanceType: "t3.small",

                amiId: "ami-123"

            }

        });

        expect(response.statusCode).toBe(200);

        expect(controlPlane.provisionNode).toHaveBeenCalledWith({

            provider: "aws",

            instanceType: "t3.small",

            amiId: "ami-123",

            labels: {},

            capabilities: [],

            count: 1,

            securityGroupIds: []

        });



        await app.close();

    });

});

