#cloud-config
package_update: true
package_upgrade: true

packages:
  - curl
  - gnupg
  - ca-certificates
  - lsb-release
  - git
  - jq
  - ufw
  - postgresql-client

write_files:
  - path: /etc/ssl/certs/linode-db-ca.crt
    permissions: '0644'
    owner: root:root
    encoding: b64
    content: "${db_ca_cert}"

  - path: /opt/app/env-static
    permissions: '0600'
    owner: root:root
    encoding: b64
    content: "${env_static_b64}"

  - path: /opt/app/deploy.sh
    permissions: '0755'
    owner: root:root
    content: |
      #!/bin/bash
      set -e

      GIT_REPO="${git_repo}"
      GIT_BRANCH="${git_branch}"
      APP_DIR="/opt/app/repo"

      CONFIGURED_URL="${public_url}"
      if [ -n "$CONFIGURED_URL" ]; then
        BASE_URL="$CONFIGURED_URL"
      else
        METADATA_TOKEN=$(curl -sf --max-time 5 -X PUT \
          -H "Metadata-Token-Expiry-Seconds: 300" \
          http://169.254.169.254/v1/token 2>/dev/null || echo "")

        PUBLIC_IP=""
        if [ -n "$METADATA_TOKEN" ]; then
          PUBLIC_IP=$(curl -sf --max-time 5 \
            -H "Metadata-Token: $METADATA_TOKEN" \
            -H "Accept: application/json" \
            http://169.254.169.254/v1/network 2>/dev/null \
            | jq -r '.ipv4.public[0] // empty' 2>/dev/null | cut -d/ -f1 || echo "")
        fi

        if [ -z "$PUBLIC_IP" ]; then
          PUBLIC_IP=$(curl -sf --max-time 10 https://ifconfig.me 2>/dev/null || echo "")
        fi

        if [ -z "$PUBLIC_IP" ]; then
          echo "ERROR: Could not determine public IP. Set public_url in terraform.tfvars."
          exit 1
        fi
        BASE_URL="http://$PUBLIC_IP"
      fi

      echo "Cloning $GIT_REPO ($GIT_BRANCH)..."
      rm -rf "$APP_DIR"
      git clone --depth 1 --branch "$GIT_BRANCH" "$GIT_REPO" "$APP_DIR"

      source /opt/app/env-static

      LCCM_DB="lccm"
      PSQL_ADMIN="-h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
      PSQL_OPTS="-h $DB_HOST -p $DB_PORT -U $DB_USER -d $LCCM_DB"
      export PGPASSWORD="$DB_PASSWORD"
      export PGSSLMODE=verify-full
      export PGSSLROOTCERT=/etc/ssl/certs/linode-db-ca.crt

      echo "Creating lccm database if it does not exist..."
      psql $PSQL_ADMIN -tc "SELECT 1 FROM pg_database WHERE datname = '$LCCM_DB'" | grep -q 1 \
        || psql $PSQL_ADMIN -c "CREATE DATABASE $LCCM_DB;"

      echo "Setting JWT secret on the lccm database..."
      psql $PSQL_OPTS -c "CREATE SCHEMA IF NOT EXISTS private; CREATE TABLE IF NOT EXISTS private.app_config (key text PRIMARY KEY, value text NOT NULL); INSERT INTO private.app_config (key, value) VALUES ('jwt_secret', '$JWT_SECRET') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;"

      echo "Applying schema..."
      psql $PSQL_OPTS -f "$APP_DIR/schema.sql"

      unset PGPASSWORD

      cp /opt/app/env-static "$APP_DIR/.env"
      sed -i "s/^DB_NAME=.*/DB_NAME=$LCCM_DB/" "$APP_DIR/.env"
      printf 'API_URL=/postgrest\n' >> "$APP_DIR/.env"
      chmod 600 "$APP_DIR/.env"

      echo "Building and starting the stack..."
      cd "$APP_DIR"
      docker compose --env-file .env up -d --build

      echo "Stack started. App accessible at $BASE_URL"

  - path: /etc/nginx/sites-available/app
    permissions: '0644'
    owner: root:root
    content: |
      server {
          listen 80;
          listen [::]:80;
          server_name _;

          location /api/ {
              rewrite ^/api/(.*) /$1 break;
              proxy_pass http://127.0.0.1:3000;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              proxy_set_header Authorization $http_authorization;
              proxy_read_timeout 300;
              proxy_send_timeout 300;
          }

          location /sync/ {
              rewrite ^/sync/(.*) /$1 break;
              proxy_pass http://127.0.0.1:3001;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }

          location / {
              proxy_pass http://127.0.0.1:8080;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
      }

runcmd:
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  - chmod a+r /etc/apt/keyrings/docker.asc
  - |
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null
  - apt-get update -y
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin nginx
  - systemctl enable --now docker
  - bash /opt/app/deploy.sh
  - rm -f /etc/nginx/sites-enabled/default
  - ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
  - nginx -t && systemctl reload nginx
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp comment 'SSH'
  - ufw allow 80/tcp comment 'HTTP'
  - ufw allow 443/tcp comment 'HTTPS'
  - ufw --force enable
  - echo "Bootstrap complete."
