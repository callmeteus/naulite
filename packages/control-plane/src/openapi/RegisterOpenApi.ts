import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

/**
 * Registers OpenAPI documentation routes on the control plane.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
    await app.register(swagger, {
        openapi: {
            openapi: "3.1.0",
            info: {
                title: "Naulite Control Plane API",
                description: "Distributed orchestration control plane HTTP API.",
                version: "0.1.0"
            },
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "API key"
                    }
                }
            },
            security: [
                {
                    bearerAuth: []
                }
            ]
        }
    });

    await app.register(swaggerUi, {
        routePrefix: "/docs",
        uiConfig: {
            docExpansion: "list",
            deepLinking: true
        }
    });
}
