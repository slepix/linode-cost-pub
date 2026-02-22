# Terraform — Linode Deployment

Provisions a self-hosted Linode instance running the Linode Cost Manager app
with a local Supabase stack, a Linode Firewall, and optional DNS records.

## Architecture

```
Internet
  │
  ▼
Linode Firewall (allow 22, 80, 443 — drop everything else)
  │
  ▼
Linode Instance (Ubuntu 22.04)
  ├── nginx  (reverse proxy on :80 → app container on 127.0.0.1:<app_port>)
  ├── Docker: linode-cost-manager app container  (127.0.0.1 only)
  └── Docker Compose: Supabase stack             (127.0.0.1 only)
        ├── kong          :8000 / :8443
        ├── db (postgres) :5432
        ├── auth (gotrue) :9999
        ├── rest (postgrest)
        ├── realtime
        ├── storage
        ├── studio        :3000
        └── meta          :8080
```

All Supabase ports are bound to `127.0.0.1` — they are **never** exposed to the internet.

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.5
- A [Linode API token](https://cloud.linode.com/profile/tokens) with full read/write access
- Your app Docker image published to a registry (e.g. GHCR, Docker Hub)

## Quick Start

```bash
cd terraform

cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars with your values

terraform init
terraform plan
terraform apply
```

## DNS

Set `domain = "example.com"` in `terraform.tfvars` to automatically:

1. Create a Linode DNS zone for the domain
2. Add `A` and `AAAA` records pointing to the instance

After apply, point your domain's nameservers to Linode:

```
ns1.linode.com
ns2.linode.com
ns3.linode.com
ns4.linode.com
ns5.linode.com
```

The `domain_nameservers` output lists these for convenience.

## JWT Keys

Both `postgrest_jwt_secret` and `postgrest_anon_key` are **auto-generated** on the
first `terraform apply` — no manual key generation or second apply required.

- `postgrest_jwt_secret` is a random 64-character string (via `random_password`)
- `postgrest_anon_key` is an HS256 JWT derived from the secret by a `python3`
  one-liner run locally during `terraform apply`

To inspect the generated values after apply:

```bash
terraform output -raw postgrest_jwt_secret
terraform output -raw postgrest_anon_key
```

To bring your own keys, set them in `terraform.tfvars`:

```hcl
postgrest_jwt_secret = "your-64-char-secret"
postgrest_anon_key   = "your-hs256-signed-jwt"
```

## File Structure

```
terraform/
├── main.tf                    # Instance, firewall, DNS resources
├── variables.tf               # Input variable declarations
├── outputs.tf                 # Output values
├── cloud-init.yaml.tpl        # cloud-init template (Docker, Supabase, schema, app)
└── terraform.tfvars.example   # Example variable values
```
