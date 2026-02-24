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
  description = "JWT secret shared by PostgREST and the database"
  value       = local.jwt_secret
  sensitive   = true
}

output "postgres_password" {
  description = "PostgreSQL superuser password"
  value       = local.postgres_password
  sensitive   = true
}

output "lccm_app_password" {
  description = "Password for the lccm_app database user (used by PostgREST and backend server)"
  value       = local.lccm_app_password
  sensitive   = true
}

output "refresh_api_secret" {
  description = "Secret for the backend refresh/sync API"
  value       = local.refresh_api_secret
  sensitive   = true
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
