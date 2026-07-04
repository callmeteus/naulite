import http from "k6/http";
import { check, sleep } from "k6";

/**
 * Ramp apply requests against a local dogfood control plane.
 *
 * Usage:
 *   k6 run scripts/load/k6-apply.js
 *
 * Environment:
 *   CP_URL - control plane base URL (default http://localhost:18080)
 *   MANIFEST_PATH - path to manifest YAML (optional)
 */

const cpUrl = __ENV.CP_URL ?? "http://localhost:18080";
const manifestPath = __ENV.MANIFEST_PATH;

export const options = {
    stages: [
        { duration: "30s", target: 5 },
        { duration: "1m", target: 10 },
        { duration: "30s", target: 0 }
    ],
    thresholds: {
        http_req_failed: ["rate<0.05"],
        http_req_duration: ["p(95)<5000"]
    }
};

const defaultManifest = `
services:
  load-test:
    image: nginx:1.27-alpine
    expose:
      - port: 80
`;

/**
 * k6 setup hook loads manifest content when MANIFEST_PATH is provided.
 *
 * @returns Setup data for default function
 */
export function setup() {
    if (!manifestPath) {
        return { manifestYaml: defaultManifest };
    }

    const manifestYaml = open(manifestPath);
    return { manifestYaml };
}

/**
 * Issues apply and list nodes requests against the control plane.
 *
 * @param data Setup payload with manifest YAML
 * @returns Nothing.
 */
export default function loadTest(data) {
    const health = http.get(`${cpUrl}/health`);
    check(health, {
        "health is 200": (response) => response.status === 200
    });

    const nodes = http.get(`${cpUrl}/nodes`, {
        headers: { Accept: "application/json" }
    });
    check(nodes, {
        "nodes list responds": (response) => response.status === 200 || response.status === 401
    });

    const apply = http.post(
        `${cpUrl}/apply`,
        JSON.stringify({ manifestYaml: data.manifestYaml }),
        {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            }
        }
    );
    check(apply, {
        "apply responds": (response) => response.status === 200 || response.status === 401 || response.status === 403
    });

    sleep(1);
}
