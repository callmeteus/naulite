import http from "node:http";

const cpUrl = (process.env.PLATFORM_CP_URL ?? "http://control-plane-1:8080").replace(/\/$/, "");
const nodeId = process.env.NODE_ID ?? "agent-1";
const hostname = process.env.HOSTNAME ?? nodeId;
const agentUrl = process.env.AGENT_URL ?? `http://${hostname}:${process.env.AGENT_PORT ?? "9470"}`;
const port = Number(process.env.AGENT_PORT ?? 9470);
const agentVersion = process.env.AGENT_VERSION ?? "dogfood-0.1.0";
const heartbeatMs = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 30_000);

/**
 * Performs an HTTP JSON request.
 *
 * @param {string} method HTTP method
 * @param {string} path Request path
 * @param {unknown} [body] Optional JSON body
 * @returns {Promise<unknown>} Parsed JSON response
 */
async function requestJson(method, path, body) {
    const response = await fetch(`${cpUrl}${path}`, {
        method,
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    const parsed = text.length > 0 ? JSON.parse(text) : undefined;

    if (!response.ok) {
        throw new Error(`CP ${method} ${path} failed: ${response.status} ${text}`);
    }

    return parsed;
}

/**
 * Registers or updates this node on the control plane.
 *
 * @returns {Promise<void>} Nothing.
 */
async function registerNode() {
    const payload = {
        id: nodeId,
        hostname,
        agentVersion,
        agentUrl,
        labels: { role: "dogfood" },
        capabilities: ["docker"],
        resources: {
            cpuMillisTotal: 4000,
            cpuMillisUsed: 0,
            memoryMbTotal: 8192,
            memoryMbUsed: 0,
            diskMbTotal: 102_400,
            diskMbUsed: 0
        }
    };

    for (let attempt = 1; attempt <= 30; attempt += 1) {
        try {
            await requestJson("POST", "/nodes/register", payload);
            process.stdout.write(`[agent] registered node id=${nodeId} url=${agentUrl}\n`);
            return;
        } catch (err) {
            process.stderr.write(
                `[agent] register attempt ${attempt}/30 failed: ${err instanceof Error ? err.message : String(err)}\n`
            );
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }

    throw new Error("Node registration failed after retries.");
}

/**
 * Sends a heartbeat to the control plane.
 *
 * @returns {Promise<void>} Nothing.
 */
async function sendHeartbeat() {
    await requestJson("POST", `/nodes/${encodeURIComponent(nodeId)}/heartbeat`, {
        status: "online",
        resources: {
            cpuMillisTotal: 4000,
            cpuMillisUsed: 500,
            memoryMbTotal: 8192,
            memoryMbUsed: 1024,
            diskMbTotal: 102_400,
            diskMbUsed: 2048
        }
    });
}

/**
 * Handles execution plan apply requests from the control plane.
 *
 * @param {import("node:http").IncomingMessage} request Incoming request
 * @param {import("node:http").ServerResponse} response Outgoing response
 * @returns {Promise<void>} Nothing.
 */
async function handleExecutionApply(request, response) {
    const chunks = [];

    for await (const chunk of request) {
        chunks.push(chunk);
    }

    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    process.stdout.write(
        `[agent] execution/apply planId=${body.planId ?? "-"} ops=${body.operations?.length ?? 0}\n`
    );

    response.writeHead(202, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
        accepted: true,
        planId: body.planId,
        nodeId
    }));
}

http
    .createServer((request, response) => {
        if (request.method === "GET" && request.url === "/health") {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ status: "ok", nodeId, agentUrl }));
            return;
        }

        if (request.method === "POST" && request.url === "/execution/apply") {
            void handleExecutionApply(request, response).catch((err) => {
                process.stderr.write(`[agent] apply failed: ${err instanceof Error ? err.message : String(err)}\n`);
                response.writeHead(500, { "Content-Type": "application/json" });
                response.end(JSON.stringify({ message: "Apply failed." }));
            });
            return;
        }

        response.writeHead(404);
        response.end("not found");
    })
    .listen(port, () => {
        process.stdout.write(`[agent] listening on ${port}\n`);

        void registerNode()
            .then(() => sendHeartbeat())
            .catch((err) => {
                process.stderr.write(
                    `[agent] registration failed: ${err instanceof Error ? err.message : String(err)}\n`
                );
            });

        setInterval(() => {
            void sendHeartbeat().catch((err) => {
                process.stderr.write(
                    `[agent] heartbeat failed: ${err instanceof Error ? err.message : String(err)}\n`
                );
            });
        }, heartbeatMs);
    });
