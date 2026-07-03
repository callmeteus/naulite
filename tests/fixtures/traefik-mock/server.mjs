import http from "node:http";

const port = Number(process.env.PORT ?? 8099);
let lastConfig: unknown = null;

const server = http.createServer((request, response) => {
    if (request.method === "PUT" && request.url === "/platform/dynamic-config") {
        const chunks: Buffer[] = [];

        request.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        request.on("end", () => {
            try {
                lastConfig = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            } catch {
                lastConfig = null;
            }

            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ ok: true }));
        });

        return;
    }

    if (request.method === "GET" && request.url === "/last-config") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(lastConfig ?? {}));
        return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, () => {
    console.log(`traefik-mock listening on ${port}`);
});
