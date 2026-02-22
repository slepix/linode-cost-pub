terraform {
  required_version = ">= 1.5"

  required_providers {
    linode = {
      source  = "linode/linode"
      version = "~> 2.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

provider "linode" {
  token = var.linode_token
}

# ---------------------------------------------------------------------------
# Random secrets
# ---------------------------------------------------------------------------

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "postgres_password" {
  length  = 32
  special = false
}

resource "random_password" "dashboard_password" {
  length  = 20
  special = false
}

# ---------------------------------------------------------------------------
# VPC + Subnet
# ---------------------------------------------------------------------------

resource "linode_vpc" "main" {
  label  = "${var.instance_label}-vpc"
  region = var.region
}

resource "linode_vpc_subnet" "main" {
  vpc_id = linode_vpc.main.id
  label  = "${var.instance_label}-subnet"
  ipv4   = var.vpc_subnet_cidr
}

# ---------------------------------------------------------------------------
# JWT key derivation
# Supabase uses two JWT tokens from the same secret:
#   anon  – low-privilege public key  (role: anon)
#   service_role – full-privilege key (role: service_role)
# ---------------------------------------------------------------------------

locals {
  jwt_secret         = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret.result
  postgres_password  = var.postgres_password != "" ? var.postgres_password : random_password.postgres_password.result
  dashboard_password = var.dashboard_password != "" ? var.dashboard_password : random_password.dashboard_password.result
}

data "external" "anon_jwt" {
  program = [
    "python3", "-c",
    <<-PYTHON
import sys, json, hmac, hashlib, base64, time

params = json.load(sys.stdin)
secret = params["secret"]
role   = params["role"]

def b64url(data):
    if isinstance(data, str):
        data = data.encode()
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

# iat = now rounded to start of day; exp = iat + 5 years (matching Supabase key generator)
now = int(time.time())
iat = now - (now % 86400)
exp = iat + (5 * 365 * 24 * 3600)

header        = b64url('{"alg":"HS256","typ":"JWT"}')
payload_obj   = {"role": role, "iss": "supabase", "iat": iat, "exp": exp}
payload       = b64url(json.dumps(payload_obj, separators=(",", ":")))
signing_input = f"{header}.{payload}".encode()
sig           = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
token         = f"{header}.{payload}.{b64url(sig)}"
print(json.dumps({"token": token}))
PYTHON
  ]

  query = {
    secret = local.jwt_secret
    role   = "anon"
  }
}

data "external" "service_role_jwt" {
  program = [
    "python3", "-c",
    <<-PYTHON
import sys, json, hmac, hashlib, base64, time

params = json.load(sys.stdin)
secret = params["secret"]
role   = params["role"]

def b64url(data):
    if isinstance(data, str):
        data = data.encode()
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

now = int(time.time())
iat = now - (now % 86400)
exp = iat + (5 * 365 * 24 * 3600)

header        = b64url('{"alg":"HS256","typ":"JWT"}')
payload_obj   = {"role": role, "iss": "supabase", "iat": iat, "exp": exp}
payload       = b64url(json.dumps(payload_obj, separators=(",", ":")))
signing_input = f"{header}.{payload}".encode()
sig           = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
token         = f"{header}.{payload}.{b64url(sig)}"
print(json.dumps({"token": token}))
PYTHON
  ]

  query = {
    secret = local.jwt_secret
    role   = "service_role"
  }
}

locals {
  anon_key          = data.external.anon_jwt.result.token
  service_role_key  = data.external.service_role_jwt.result.token

  user_data = templatefile("${path.module}/cloud-init.yaml.tpl", {
    jwt_secret         = local.jwt_secret
    anon_key           = local.anon_key
    service_role_key   = local.service_role_key
    postgres_password  = local.postgres_password
    dashboard_password = local.dashboard_password
    git_repo           = var.git_repo
    git_branch         = var.git_branch
    public_url         = var.public_url != "" ? var.public_url : (var.domain != "" ? "http://${var.domain}" : "")
  })

  has_domain = var.domain != ""
}

# ---------------------------------------------------------------------------
# Linode Instance
# ---------------------------------------------------------------------------

resource "linode_instance" "app" {
  label           = var.instance_label
  region          = var.region
  type            = var.instance_type
  image           = "linode/ubuntu22.04"
  authorized_keys = var.ssh_authorized_keys
  root_pass       = var.root_password
  tags            = var.tags
  interface_generation = "legacy_config"

  interface {
    purpose   = "vpc"
    subnet_id = linode_vpc_subnet.main.id
    ipv4 {
      vpc     = var.instance_vpc_ip
      nat_1_1 = "any"
    }
  }

  metadata {
    user_data = base64gzip(local.user_data)
  }

  lifecycle {
    ignore_changes = [
      metadata,
    ]
  }
}

# ---------------------------------------------------------------------------
# Firewall
# ---------------------------------------------------------------------------

resource "linode_firewall" "app" {
  label = "${var.instance_label}-fw"
  tags  = var.tags

  inbound_policy  = "DROP"
  outbound_policy = "ACCEPT"

  inbound {
    label    = "allow-ssh"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "22"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  inbound {
    label    = "allow-http"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "80"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  inbound {
    label    = "allow-https"
    action   = "ACCEPT"
    protocol = "TCP"
    ports    = "443"
    ipv4     = ["0.0.0.0/0"]
    ipv6     = ["::/0"]
  }

  linodes = [linode_instance.app.id]
}

# ---------------------------------------------------------------------------
# DNS (optional — only created when var.domain is set)
# ---------------------------------------------------------------------------

resource "linode_domain" "app" {
  count       = local.has_domain ? 1 : 0
  type        = "master"
  domain      = var.domain
  soa_email   = "admin@${var.domain}"
  tags        = var.tags
  description = "Managed by Terraform for ${var.instance_label}"
}

resource "linode_domain_record" "root_a" {
  count       = local.has_domain ? 1 : 0
  domain_id   = linode_domain.app[0].id
  name        = ""
  record_type = "A"
  target      = one(linode_instance.app.ipv4)
  ttl_sec     = var.domain_ttl
}

resource "linode_domain_record" "www_a" {
  count       = local.has_domain ? 1 : 0
  domain_id   = linode_domain.app[0].id
  name        = "www"
  record_type = "A"
  target      = one(linode_instance.app.ipv4)
  ttl_sec     = var.domain_ttl
}

resource "linode_domain_record" "root_aaaa" {
  count       = local.has_domain && length(linode_instance.app.ipv6) > 0 ? 1 : 0
  domain_id   = linode_domain.app[0].id
  name        = ""
  record_type = "AAAA"
  target      = split("/", linode_instance.app.ipv6)[0]
  ttl_sec     = var.domain_ttl
}

resource "linode_domain_record" "www_aaaa" {
  count       = local.has_domain && length(linode_instance.app.ipv6) > 0 ? 1 : 0
  domain_id   = linode_domain.app[0].id
  name        = "www"
  record_type = "AAAA"
  target      = split("/", linode_instance.app.ipv6)[0]
  ttl_sec     = var.domain_ttl
}

# ---------------------------------------------------------------------------
# Post-deploy key rotation provisioner
# Runs whenever jwt_secret or anon_key change, without rebuilding the VM.
# Updates the Supabase .env and restarts the stack, then rebuilds the app.
# ---------------------------------------------------------------------------

resource "null_resource" "update_keys" {
  triggers = {
    jwt_secret        = local.jwt_secret
    anon_key          = local.anon_key
    service_role_key  = local.service_role_key
    postgres_password = local.postgres_password
  }

  depends_on = [linode_instance.app]

  connection {
    type     = "ssh"
    host     = one(linode_instance.app.ipv4)
    user     = "root"
    password = var.root_password
    timeout  = "10m"
  }

  provisioner "remote-exec" {
    inline = [
      "/bin/sleep 240",

      # ---- 1. Update Supabase .env ----
      "/bin/sed -i 's|^JWT_SECRET=.*|JWT_SECRET=${local.jwt_secret}|' /opt/supabase/.env",
      "/bin/sed -i 's|^ANON_KEY=.*|ANON_KEY=${local.anon_key}|' /opt/supabase/.env",
      "/bin/sed -i 's|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=${local.service_role_key}|' /opt/supabase/.env",
      "/bin/sed -i 's|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${local.postgres_password}|' /opt/supabase/.env",

      # ---- 2. Restart Supabase stack ----
      "cd /opt/supabase && docker compose --env-file .env up -d --force-recreate",

      # ---- 3. Rebuild and restart app container ----
      "/bin/sed -i 's|^ANON_KEY=.*|ANON_KEY=\"${local.anon_key}\"|' /opt/app/build-and-run.sh",
      "/bin/sed -i 's|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=\"${local.service_role_key}\"|' /opt/app/build-and-run.sh",
      "/bin/bash /opt/app/build-and-run.sh",
    ]
  }
}
