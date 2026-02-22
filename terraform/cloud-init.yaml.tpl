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
  - path: /opt/app/build-and-run.sh
    permissions: '0755'
    owner: root:root
    content: |
      #!/bin/bash
      set -e

      GIT_REPO="${git_repo}"
      GIT_BRANCH="${git_branch}"
      ANON_KEY="${anon_key}"
      SERVICE_ROLE_KEY="${service_role_key}"
      APP_DIR="/opt/app/repo"

      # Resolve the public base URL the browser will use.
      # Priority: 1) Terraform-provided value, 2) Linode metadata API, 3) fallback ifconfig.me
      CONFIGURED_URL="${public_url}"
      if [ -n "$CONFIGURED_URL" ]; then
        BASE_URL="$CONFIGURED_URL"
      else
        # Use Linode metadata API per docs: PUT /v1/token first, then GET /v1/network
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

      # Update Supabase .env with resolved URLs (Supabase Kong listens on :8000)
      sed -i "s|^SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=$BASE_URL|" /opt/supabase/.env
      sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=$BASE_URL|" /opt/supabase/.env
      sed -i "s|^SITE_URL=.*|SITE_URL=$BASE_URL|" /opt/supabase/.env

      # The frontend VITE_SUPABASE_URL points at the server base URL.
      # The host nginx routes /rest/v1/, /auth/v1/ etc. to Kong on :8000.
      VITE_SUPABASE_URL="$BASE_URL"

      echo "Cloning $GIT_REPO ($GIT_BRANCH)..."
      rm -rf "$APP_DIR"
      git clone --depth 1 --branch "$GIT_BRANCH" "$GIT_REPO" "$APP_DIR"

      echo "Building Docker image (VITE_SUPABASE_URL=$VITE_SUPABASE_URL)..."
      docker build \
        --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
        --build-arg VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
        -t linode-cost-manager:local \
        "$APP_DIR"

      echo "Starting app container..."
      docker rm -f linode-cost-manager 2>/dev/null || true
      docker run -d \
        --name linode-cost-manager \
        --restart unless-stopped \
        -p 127.0.0.1:8080:80 \
        --add-host=host.docker.internal:host-gateway \
        -e SUPABASE_URL="http://host.docker.internal:8000" \
        -e SUPABASE_ANON_KEY="$ANON_KEY" \
        -e SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
        linode-cost-manager:local

      echo "App container started. Accessible at $BASE_URL"

  - path: /opt/app/import-schema.sh
    permissions: '0755'
    owner: root:root
    content: |
      #!/bin/bash
      set -e

      APP_DIR="/opt/app/repo"
      POSTGRES_PASSWORD="${postgres_password}"

      # Connect directly to the Supabase Postgres container on its published port (5432).
      # We bypass Supavisor here because it may not be fully ready yet.
      # The Supabase docker-compose publishes db:5432 to host 127.0.0.1:5432.
      DB_URL="postgresql://postgres:$POSTGRES_PASSWORD@127.0.0.1:5432/postgres"

      echo "Waiting for Postgres to be ready..."
      for i in $(seq 1 60); do
        if PGPASSWORD="$POSTGRES_PASSWORD" psql "$DB_URL" -c "SELECT 1" > /dev/null 2>&1; then
          echo "Postgres is ready after $i attempts."
          break
        fi
        echo "Waiting for Postgres ($i/60)..."
        sleep 5
      done

      MIGRATIONS_DIR="$APP_DIR/supabase/migrations"
      if [ -d "$MIGRATIONS_DIR" ] && ls "$MIGRATIONS_DIR"/*.sql > /dev/null 2>&1; then
        echo "Applying migrations from $MIGRATIONS_DIR..."
        for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
          echo "  -> $migration"
          PGPASSWORD="$POSTGRES_PASSWORD" psql "$DB_URL" -f "$migration" \
            || echo "  WARNING: $migration failed (may already be applied, continuing)"
        done
        echo "All migrations applied."
      elif [ -f "$APP_DIR/setup.sql" ]; then
        echo "Applying setup.sql..."
        PGPASSWORD="$POSTGRES_PASSWORD" psql "$DB_URL" -f "$APP_DIR/setup.sql"
        echo "setup.sql applied."
      else
        echo "No migrations or setup.sql found — skipping schema import."
      fi

  - path: /etc/nginx/sites-available/app
    permissions: '0644'
    owner: root:root
    content: |
      server {
          listen 80;
          listen [::]:80;
          server_name _;

          # Supabase Kong API gateway — /rest/v1/, /auth/v1/, /storage/v1/, /realtime/v1/
          location ~ ^/(rest|auth|storage|realtime)/v1(.*) {
              proxy_pass http://127.0.0.1:8000/$1/v1$2$is_args$args;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
              proxy_set_header Authorization $http_authorization;
              proxy_read_timeout 300;
              proxy_send_timeout 300;
          }

          # App frontend + Node API server
          location / {
              proxy_pass http://127.0.0.1:8080;
              proxy_set_header Host $host;
              proxy_set_header X-Real-IP $remote_addr;
              proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
              proxy_set_header X-Forwarded-Proto $scheme;
          }
      }

runcmd:
  # ---- Install Docker ----
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

  # ---- Install Supabase self-hosted ----
  # Step 1: Clone the official repo to get docker-compose files + volumes scaffold
  - git clone --depth 1 https://github.com/supabase/supabase /opt/supabase-src

  # Step 2: Create the project directory and copy compose files
  - mkdir -p /opt/supabase
  - cp -r /opt/supabase-src/docker/. /opt/supabase/
  - rm -rf /opt/supabase-src

  # Step 3: Copy the example .env as a base, then patch in all required secrets
  - cp /opt/supabase/.env.example /opt/supabase/.env
  - chmod 600 /opt/supabase/.env

  # Step 4: Patch in Terraform-provided secrets
  - |
    sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${postgres_password}|" /opt/supabase/.env
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${jwt_secret}|" /opt/supabase/.env
    sed -i "s|^ANON_KEY=.*|ANON_KEY=${anon_key}|" /opt/supabase/.env
    sed -i "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=${service_role_key}|" /opt/supabase/.env
    sed -i "s|^DASHBOARD_USERNAME=.*|DASHBOARD_USERNAME=supabase|" /opt/supabase/.env
    sed -i "s|^DASHBOARD_PASSWORD=.*|DASHBOARD_PASSWORD=${dashboard_password}|" /opt/supabase/.env

  # Step 5: Generate and patch in the required random security keys
  - |
    SECRET_KEY_BASE=$(openssl rand -base64 48 | tr -d '\n/+' | head -c 64)
    VAULT_ENC_KEY=$(openssl rand -hex 16)
    PG_META_CRYPTO_KEY=$(openssl rand -base64 24 | tr -d '\n/+=' | head -c 32)
    LOGFLARE_PUBLIC=$(openssl rand -base64 24 | tr -d '\n/+=' | head -c 32)
    LOGFLARE_PRIVATE=$(openssl rand -base64 24 | tr -d '\n/+=' | head -c 32)
    S3_KEY_ID=$(openssl rand -hex 16)
    S3_KEY_SECRET=$(openssl rand -hex 32)
    MINIO_PASS=$(openssl rand -hex 16)

    # Use @ as sed delimiter to avoid clashes with base64 chars
    sed -i "s@^SECRET_KEY_BASE=.*@SECRET_KEY_BASE=$SECRET_KEY_BASE@" /opt/supabase/.env
    sed -i "s@^VAULT_ENC_KEY=.*@VAULT_ENC_KEY=$VAULT_ENC_KEY@" /opt/supabase/.env
    sed -i "s@^PG_META_CRYPTO_KEY=.*@PG_META_CRYPTO_KEY=$PG_META_CRYPTO_KEY@" /opt/supabase/.env
    sed -i "s@^LOGFLARE_PUBLIC_ACCESS_TOKEN=.*@LOGFLARE_PUBLIC_ACCESS_TOKEN=$LOGFLARE_PUBLIC@" /opt/supabase/.env
    sed -i "s@^LOGFLARE_PRIVATE_ACCESS_TOKEN=.*@LOGFLARE_PRIVATE_ACCESS_TOKEN=$LOGFLARE_PRIVATE@" /opt/supabase/.env
    sed -i "s@^S3_PROTOCOL_ACCESS_KEY_ID=.*@S3_PROTOCOL_ACCESS_KEY_ID=$S3_KEY_ID@" /opt/supabase/.env
    sed -i "s@^S3_PROTOCOL_ACCESS_KEY_SECRET=.*@S3_PROTOCOL_ACCESS_KEY_SECRET=$S3_KEY_SECRET@" /opt/supabase/.env
    sed -i "s@^MINIO_ROOT_PASSWORD=.*@MINIO_ROOT_PASSWORD=$MINIO_PASS@" /opt/supabase/.env

  # Step 6: Pull Supabase images
  - |
    echo "Pulling Supabase Docker images..."
    cd /opt/supabase
    docker compose --env-file .env pull
    echo "Images pulled."

  # Step 7: Start Supabase stack
  - |
    echo "Starting Supabase..."
    cd /opt/supabase
    docker compose --env-file .env up -d
    echo "Supabase stack started."

  # Step 8: Wait for Supabase Kong API gateway on port 8000
  - |
    echo "Waiting for Supabase API gateway (port 8000)..."
    for i in $(seq 1 60); do
      if curl -sf --max-time 3 http://127.0.0.1:8000/ > /dev/null 2>&1; then
        echo "Supabase API ready after $i attempts."
        break
      fi
      echo "  ($i/60) waiting..."
      sleep 5
    done

  # Step 9: Clone app repo, build Docker image, start app container
  - bash /opt/app/build-and-run.sh

  # Step 10: Import database schema
  - bash /opt/app/import-schema.sh

  # Step 11: Configure host nginx as reverse proxy
  - rm -f /etc/nginx/sites-enabled/default
  - ln -sf /etc/nginx/sites-available/app /etc/nginx/sites-enabled/app
  - nginx -t && systemctl reload nginx

  # Step 12: Harden with UFW
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp comment 'SSH'
  - ufw allow 80/tcp comment 'HTTP'
  - ufw allow 443/tcp comment 'HTTPS'
  - ufw --force enable

  - echo "Bootstrap complete."
