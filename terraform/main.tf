terraform {
  required_version = ">= 1.5"

  required_providers {
    linode = {
      source  = "linode/linode"
    }
    random = {
      source  = "hashicorp/random"
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

resource "random_password" "refresh_api_secret" {
  length  = 48
  special = false
}

# ---------------------------------------------------------------------------
# Resolved secrets (prefer explicit vars, fall back to random)
# ---------------------------------------------------------------------------

locals {
  jwt_secret         = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret.result
  refresh_api_secret = var.refresh_api_secret != "" ? var.refresh_api_secret : random_password.refresh_api_secret.result

  env_static_b64 = base64encode(join("\n", [
    "JWT_SECRET=${local.jwt_secret}",
    "REFRESH_API_SECRET=${local.refresh_api_secret}",
    "DB_HOST=${linode_database_postgresql_v2.db.host_primary}",
    "DB_PORT=${linode_database_postgresql_v2.db.port}",
    "DB_NAME=defaultdb",
    "DB_USER=${linode_database_postgresql_v2.db.root_username}",
    "DB_PASSWORD=${linode_database_postgresql_v2.db.root_password}",
    "",
  ]))

  user_data = templatefile("${path.module}/cloud-init.yaml.tpl", {
    git_repo       = var.git_repo
    git_branch     = var.git_branch
    public_url     = var.public_url
    db_ca_cert     = linode_database_postgresql_v2.db.ca_cert
    env_static_b64 = local.env_static_b64
  })

  has_domain = var.domain != ""
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
# Managed PostgreSQL Database
# ---------------------------------------------------------------------------

resource "linode_database_postgresql_v2" "db" {
  label     = "${var.instance_label}-db"
  engine_id = var.db_engine_id
  region    = var.region
  type      = var.db_type

  # Allow connections from the app instance's VPC IP and any extra CIDRs
  allow_list = concat(
    ["${var.instance_vpc_ip}/32"],
    var.db_extra_allow_list
  )

  cluster_size = var.db_cluster_size

  updates = {
    duration    = var.db_updates_duration
    frequency   = var.db_updates_frequency
    hour_of_day = var.db_updates_hour_of_day
    day_of_week = var.db_updates_day_of_week
  }
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
