FROM node:20-alpine AS frontend-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

FROM node:20-alpine AS server-builder

WORKDIR /server

COPY server/package*.json ./
RUN npm ci

COPY server/ ./
RUN npm run build

FROM node:20-alpine AS server-runtime

WORKDIR /server
COPY --from=server-builder /server/package*.json ./
RUN npm ci --omit=dev
COPY --from=server-builder /server/dist ./dist

FROM nginx:alpine

RUN apk add --no-cache nodejs npm

COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=server-runtime /server /api

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80 3001

CMD ["/docker-entrypoint.sh"]
