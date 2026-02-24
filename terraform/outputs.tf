output "instance_id" {
  description = "Linode instance ID"
  value       = linode_instance.app.id
}

output "instance_ip" {
  description = "Public IPv4 address of the Linode instance"
  value       = linode_instance.app.ipv4
}

output "instance_ipv6" {
  description = "Public IPv6 address of the Linode instance"
  value       = linode_instance.app.ipv6
}

output "firewall_id" {
  description = "Linode Firewall ID"
  value       = linode_firewall.app.id
}

output "vpc_id" {
  description = "VPC ID"
  value       = linode_vpc.main.id
}

output "vpc_subnet_id" {
  description = "VPC Subnet ID"
  value       = linode_vpc_subnet.main.id
}

output "app_url" {
  description = "URL to access the application"
  value       = local.has_domain ? "http://${var.domain}" : "http://${one(linode_instance.app.ipv4)}"
}

output "jwt_secret" {
  description = "JWT secret used by PostgREST"
  value       = local.jwt_secret
  sensitive   = true
}

output "refresh_api_secret" {
  description = "Secret for the backend refresh/sync API"
  value       = local.refresh_api_secret
  sensitive   = true
}

output "db_id" {
  description = "Managed Database ID"
  value       = linode_database_postgresql_v2.db.id
}

output "db_host_primary" {
  description = "Primary host for the Managed Database"
  value       = linode_database_postgresql_v2.db.host_primary
}

output "db_host_secondary" {
  description = "Secondary/private host for the Managed Database"
  value       = linode_database_postgresql_v2.db.host_secondary
}

output "db_port" {
  description = "Port for the Managed Database"
  value       = linode_database_postgresql_v2.db.port
}

output "db_name" {
  description = "Default database name"
  value       = "defaultdb"
}

output "db_root_username" {
  description = "Root username for the Managed Database"
  value       = linode_database_postgresql_v2.db.root_username
  sensitive   = true
}

output "db_root_password" {
  description = "Root password for the Managed Database"
  value       = linode_database_postgresql_v2.db.root_password
  sensitive   = true
}

output "db_ca_cert" {
  description = "Base64-encoded SSL CA certificate for the Managed Database"
  value       = linode_database_postgresql_v2.db.ca_cert
  sensitive   = true
}

output "db_version" {
  description = "PostgreSQL engine version"
  value       = linode_database_postgresql_v2.db.version
}

output "domain_nameservers" {
  description = "Linode nameservers to set at your registrar (only when domain is configured)"
  value = local.has_domain ? [
    "ns1.linode.com",
    "ns2.linode.com",
    "ns3.linode.com",
    "ns4.linode.com",
    "ns5.linode.com",
  ] : []
}
