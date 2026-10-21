# Naulite dogfood lab

Local scripts and compose overlays for GitOps proofs (Gitea, MiniStack S3, EC2 provisioning). This folder is safe to commit **except** paths listed in `.gitignore`.

## LuckyMaker integration (local only)

Naulite is a **public** repository. LuckyMaker lab assets live in the **private** repo:

`luckymaker/.naulite/lab/` (gitops, `run-phase-*`, env docker, `bake-luckymaker-sandbox.sh`).

Set `NAULITE_LM_LAB_DIR` to override. Public scripts here source `lib/naulite-lm-lab.sh` for defaults.

Set `NAULITE_ROOT` to your `packages/naulite` checkout when scripts need the repo root.

## Public lab pieces (tracked)

| File | Purpose |
| ---- | ------- |
| `gitea-compose.yml` | Gitea for webhook tests |
| `ec2-lab-agent.compose.yml` / `ec2-lab-agent.Dockerfile` | Lab agent container |
| `provision-ministack-ec2.sh` | MiniStack `RunInstances` + lab agent |
| `verify-ministack-runinstances-lab.sh` | Assert EC2 container exists |
| `run-gitea-webhook-lab.sh` | Simulate Gitea push (generic env vars) |
| `run-gitea-e2e-lab.sh` | Real webhook to control plane |
| `prove-s3-artifact.sh` | Upload stub artifact to local S3 |
| `clean-lab-provisioning-leftovers.sh` | Drop stuck provisioning rows in lab DB |
| `ensure-lab-bootstrap-admin.sh` | Reset lab admin login |
| `ensure-ministack-lab-ami.sh` | Lab AMI helper |
| `run-e7-notify-lab.sh` / `run-e7-notify-proof.sh` | E7 notify mock listener |

## Tower UI (local dev with lab CP)

Gitea lab uses port **3001**. That is not the Naulite admin BFF. If `VITE_ADMIN_API_URL` points at `http://127.0.0.1:3001`, the login screen shows *Could not reach the admin API. Check that the BFF is running.*

1. Control plane (example): `NAULITE_URL=http://127.0.0.1:18082`
2. Admin BFF (pick a free port, e.g. **3011**):

```bash
cd packages/naulite
CONTROL_PLANE_INSTANCES=http://127.0.0.1:18082 NAULITE_UI_BACKEND_PORT=3011 yarn workspace @naulite/ui-backend dev
```

3. Frontend: do **not** set `VITE_ADMIN_API_URL`. Proxy `/api` to the BFF:

```bash
ADMIN_API_URL=http://127.0.0.1:3011 yarn workspace @naulite/ui-frontend dev --host 127.0.0.1 --port 5173
```

Open http://127.0.0.1:5173/login.

Lab CP on **18082** uses `data/control-plane-lab182.db`. Default UI login (same as `dogfood/bin/dev.sh`):

| Email | Password |
| ----- | -------- |
| `admin@naulite.local` | `naulite-dev` |

If you do not know the password, run `bash dogfood/lab/ensure-lab-bootstrap-admin.sh` while the CP is up (resets admin users in the lab DB and bootstraps those defaults).

E7 deploy notifications: set `NAULITE_E7_NOTIFY_WEBHOOK_URL` (and optional secret) on the control plane process.
`run-e7-notify-lab.sh` listens on port 18123 and waits for a POST after you restart CP with that URL.

Point `S3_ENDPOINT` / `S3_ENDPOINT_URL` at `http://ministack:4566` on the `ministack_default` network.
