#!/usr/bin/env node
/**
 * Renders traefik.yml from traefik.yml.template based on NAULITE_TLS_MODE.
 *
 * Environment:
 * - NAULITE_TLS_MODE: acme_tls | acme_dns_cloudflare | passthrough | self_signed | custom
 * - ACME_EMAIL: contact email for ACME registration
 * - ACME_CA_SERVER: ACME directory URL (staging or production)
 * - CF_DNS_API_TOKEN: Cloudflare API token for DNS-01 challenge
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const VALID_MODES = new Set([
    "acme_tls",
    "acme_dns_cloudflare",
    "passthrough",
    "self_signed",
    "custom"
]);

const mode = (process.env.NAULITE_TLS_MODE ?? "acme_tls").trim().toLowerCase();

if (!VALID_MODES.has(mode)) {
    console.error(
        `[traefik-render] invalid NAULITE_TLS_MODE="${mode}"; expected one of: ${[...VALID_MODES].join(", ")}`
    );
    process.exit(1);
}

const acmeEmail = process.env.ACME_EMAIL?.trim() || "platform@localhost";
const acmeCaServer = process.env.ACME_CA_SERVER?.trim()
    || "https://acme-staging-v02.api.letsencrypt.org/directory";
const cfDnsApiToken = process.env.CF_DNS_API_TOKEN?.trim() ?? "";

console.debug("[traefik-render] mode=%s email=%s ca=%s", mode, acmeEmail, acmeCaServer);

/**
 * Builds optional TLS options for the websecure entry point.
 *
 * @returns YAML fragment for websecure TLS options
 */
function buildWebsecureTlsOptions() {
    if (mode !== "passthrough") {
        return "";
    }

    return `
        http:
            tls:
                passthrough: true`;
}

/**
 * Builds the certificatesResolvers block for ACME modes.
 *
 * @returns YAML fragment or empty string
 */
function buildCertificatesResolvers() {
    if (mode !== "acme_tls" && mode !== "acme_dns_cloudflare") {
        return "";
    }

    if (mode === "acme_tls") {
        return `certificatesResolvers:
    letsencrypt:
        acme:
            email: "${acmeEmail}"
            storage: /acme/acme.json
            caServer: "${acmeCaServer}"
            tlsChallenge: {}
`;
    }

    if (!cfDnsApiToken) {
        console.error("[traefik-render] CF_DNS_API_TOKEN is required for acme_dns_cloudflare mode");
        process.exit(1);
    }

    return `certificatesResolvers:
    letsencrypt:
        acme:
            email: "${acmeEmail}"
            storage: /acme/acme.json
            caServer: "${acmeCaServer}"
            dnsChallenge:
                provider: cloudflare
                resolvers:
                    - "1.1.1.1:53"
                    - "8.8.8.8:53"
`;
}

/**
 * Builds optional static TLS stores for self-signed mode.
 *
 * @returns YAML fragment or empty string
 */
function buildTlsStores() {
    if (mode !== "self_signed") {
        return "";
    }

    return `tls:
    stores:
        default:
            defaultGeneratedCert:
                resolver: ""
                domain:
                    main: "platform.local"
                    sans:
                        - "*.platform.local"
`;
}

const templatePath = join(__dirname, "traefik.yml.template");
const outputPath = join(__dirname, "traefik.generated.yml");
const template = readFileSync(templatePath, "utf8");

const rendered = template
    .replace("{{WEBSECURE_TLS_OPTIONS}}", buildWebsecureTlsOptions())
    .replace("{{CERTIFICATES_RESOLVERS}}", buildCertificatesResolvers())
    .replace("{{TLS_STORES}}", buildTlsStores());

writeFileSync(outputPath, rendered, "utf8");
console.debug("[traefik-render] wrote %s", outputPath);
