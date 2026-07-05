import http from "node:http";

const port = Number(process.env.PORT ?? 8099);
let lastConfig = {
    http: {
        routers: {},
        services: {},
        middlewares: {}
    }
};

const server = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        return;
    }

    if (request.method === "PUT" && request.url === "/naulite/dynamic-config") {
        const chunks = [];

        request.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        request.on("end", () => {
            try {
                lastConfig = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            } catch {
                lastConfig = {
                    http: {
                        routers: {},
                        services: {},
                        middlewares: {}
                    }
                };
            }

            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ ok: true }));
        });

        return;
    }

    if (request.method === "GET" && request.url === "/naulite/dynamic-config") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(lastConfig));
        return;
    }

    if (request.method === "GET" && request.url === "/last-config") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(lastConfig));
        return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, () => {
    console.log(`traefik dynamic-config store listening on ${port}`);
});
