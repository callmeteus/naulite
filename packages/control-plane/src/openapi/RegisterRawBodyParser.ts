import type { FastifyInstance } from "fastify";

/**
 * Registers raw body capture for routes that verify webhook signatures.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerRawBodyParser(app: FastifyInstance): Promise<void> {
    app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => {
        done(null, body);
    });

    app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
        const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
        request.rawBody = rawBody;
        try {
            const parsed = JSON.parse(rawBody.toString("utf8")) as unknown;
            done(null, parsed);
        } catch (error) {
            done(error as Error, undefined);
        }
    });
}
