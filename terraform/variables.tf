variable "linode_token" {
  description = "Linode API token with read/write access"
  type        = string
  sensitive   = true
}

variable "region" {
  description = "Linode region (e.g. us-east, eu-west, ap-south)"
  type        = string
  default     = "us-east"
}

variable "instance_type" {
  description = "Linode instance plan for the app VM (e.g. g6-standard-2, g6-standard-4). Supabase Docker requires at least 2 GB RAM; g6-standard-2 (4 GB) recommended."
  type        = string
  default     = "g6-standard-2"
}

variable "instance_label" {
  description = "Label for the Linode instance (also used as prefix for other resources)"
  type        = string
  default     = "linode-cost-manager"
}

variable "ssh_authorized_keys" {
  description = "List of SSH public keys to authorize on the instance"
  type        = list(string)
  default     = []
}

variable "root_password" {
  description = "Root password for the Linode instance"
  type        = string
  sensitive   = true
}

variable "public_url" {
  description = "Public base URL the browser uses to reach the app (e.g. http://1.2.3.4 or https://yourdomain.com). Used as VITE_SUPABASE_URL during docker build. Leave empty to auto-detect the VM's public IP at boot."
  type        = string
  default     = ""
}

variable "git_repo" {
  description = "Public GitHub repository URL to clone and build (e.g. https://github.com/youruser/linode-cost-manager)"
  type        = string
}

variable "git_branch" {
  description = "Git branch to check out"
  type        = string
  default     = "main"
}

variable "domain" {
  description = "Domain name to create DNS records for (leave empty to skip DNS)"
  type        = string
  default     = ""
}

variable "domain_ttl" {
  description = "TTL in seconds for DNS records"
  type        = number
  default     = 300
}

variable "tags" {
  description = "Tags to apply to Linode resources"
  type        = list(string)
  default     = ["linode-cost-manager"]
}

# ---------------------------------------------------------------------------
# VPC
# ---------------------------------------------------------------------------

variable "vpc_subnet_cidr" {
  description = "IPv4 CIDR for the VPC subnet (e.g. 10.0.1.0/24)"
  type        = string
  default     = "10.0.1.0/24"
}

variable "instance_vpc_ip" {
  description = "Static VPC IP for the app instance (must be within vpc_subnet_cidr, e.g. 10.0.1.10)"
  type        = string
  default     = "10.0.1.10"
}

# ---------------------------------------------------------------------------
# Supabase / JWT
# ---------------------------------------------------------------------------

variable "jwt_secret" {
  description = "HS256 JWT secret used by Supabase (min 32 chars). Leave blank to auto-generate."
  type        = string
  sensitive   = true
  default     = ""
}

variable "postgres_password" {
  description = "Password for the Supabase internal PostgreSQL superuser. Leave blank to auto-generate."
  type        = string
  sensitive   = true
  default     = ""
}

variable "dashboard_password" {
  description = "Password for the Supabase Studio dashboard. Leave blank to auto-generate."
  type        = string
  sensitive   = true
  default     = ""
}
