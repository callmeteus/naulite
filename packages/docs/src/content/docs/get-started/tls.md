---
title: TLS modes
description: Configure Traefik TLS termination for Platform ingress with PLATFORM_TLS_MODE.
---

# TLS modes

Platform exposes public ingress through Traefik. Set `PLATFORM_TLS_MODE` on the control plane and in `dogfood/.env` to choose how certificates are provisioned.

| Mode | Purpose |
|------|---------|
| `acme_tls` | Let's Encrypt via TLS-ALPN challenge (default for dogfood) |
| `acme_dns_cloudflare` | Let's Encrypt via DNS-01 with Cloudflare |
| `passthrough` | TLS passthrough to backend services |
| `self_signed` | Traefik default generated certificate for local use |
| `custom` | Certificates from cluster secrets via manifest `ingress.tls` |

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `PLATFORM_TLS_MODE` | No (`acme_tls`) | Active TLS mode |
| `ACME_EMAIL` | ACME modes | Contact email for Let's Encrypt |
| `ACME_CA_SERVER` | No | ACME directory URL (staging by default in dogfood) |
| `CF_DNS_API_TOKEN` | `acme_dns_cloudflare` | Cloudflare API token with DNS edit permission |

Dogfood renders Traefik static config from `dogfood/infra/traefik/traefik.yml.template` using `render-traefik-config.mjs` before the Traefik container starts.

## Custom certificates in manifests

When `ingress.tls.certificateSecret` and `ingress.tls.privateKeySecret` reference cluster secrets, apply resolves PEM material and calls the gateway provider:

```yaml
services:
  api:
    ingress:
      host: api.example.com
      exposure: public
      tls:
        certificateSecret:
          secretName: api-tls
          key: tls.crt
        privateKeySecret:
          secretName: api-tls
          key: tls.key
      paths:
        - path: /
          port: 8080
```

Secret keys default to `tls.crt` and `tls.key` when omitted.

## Choosing a mode

- **Production with public HTTP-01/TLS-ALPN**: `acme_tls` with production `ACME_CA_SERVER`
- **Production behind Cloudflare or wildcard certs**: `acme_dns_cloudflare` plus `CF_DNS_API_TOKEN`
- **End-to-end TLS to the app**: `passthrough`
- **Local dogfood without ACME**: `self_signed` or `custom`

See [Install](/get-started/install/) for bootstrap and [Manifest examples](/guides/manifest-examples/) for ingress samples.
