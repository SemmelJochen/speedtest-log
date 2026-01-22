# Frontend Dockerfile - SPA with nginx
FROM node:20-alpine AS builder

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# API URL is auto-detected at runtime from window.location.hostname
# No build-time configuration needed

# Copy workspace config and lockfile from root
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY frontend/package.json ./frontend/

# Install frontend dependencies only
RUN pnpm install --filter speedtest-logger-frontend --frozen-lockfile

# Copy frontend source code
WORKDIR /app/frontend
COPY frontend ./

# Build the application
RUN pnpm run build

# Production stage with nginx
FROM nginx:alpine AS runner

# Copy built files to nginx
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Copy custom nginx config for SPA routing
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
