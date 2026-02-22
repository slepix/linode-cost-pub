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

output "supabase_url" {
  description = "Supabase API URL (Kong gateway) — set as VITE_SUPABASE_URL in the frontend"
  value       = local.has_domain ? "http://${var.domain}" : "http://${one(linode_instance.app.ipv4)}"
}

output "supabase_anon_key" {
  description = "Supabase anon JWT key — set as VITE_SUPABASE_ANON_KEY in the frontend"
  value       = local.anon_key
  sensitive   = true
}

output "supabase_service_role_key" {
  description = "Supabase service_role JWT key — for server-side / admin use only, never expose to browsers"
  value       = local.service_role_key
  sensitive   = true
}

output "supabase_jwt_secret" {
  description = "JWT secret shared by all Supabase services"
  value       = local.jwt_secret
  sensitive   = true
}

output "supabase_postgres_password" {
  description = "PostgreSQL superuser password (for DBA use only)"
  value       = local.postgres_password
  sensitive   = true
}

output "supabase_dashboard_password" {
  description = "Password for Supabase Studio dashboard (username: supabase)"
  value       = local.dashboard_password
  sensitive   = true
}

output "supabase_studio_url" {
  description = "URL for Supabase Studio dashboard"
  value       = local.has_domain ? "http://${var.domain}/studio/" : "http://${one(linode_instance.app.ipv4)}/studio/"
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
