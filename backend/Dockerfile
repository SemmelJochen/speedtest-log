# Backend Dockerfile with Speedtest CLI
FROM node:20-alpine

# Install dependencies for speedtest-cli and Prisma
# libc6-compat provides glibc compatibility for the speedtest binary
RUN apk add --no-cache curl ca-certificates openssl libc6-compat

# Install Ookla Speedtest CLI manually
# Detect architecture and download appropriate binary
RUN ARCH=$(uname -m) && \
    echo "Detected architecture: $ARCH" && \
    if [ "$ARCH" = "x86_64" ]; then \
        SPEEDTEST_URL="https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-linux-x86_64.tgz"; \
    elif [ "$ARCH" = "aarch64" ]; then \
        SPEEDTEST_URL="https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-linux-aarch64.tgz"; \
    elif [ "$ARCH" = "armv7l" ]; then \
        SPEEDTEST_URL="https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-linux-armhf.tgz"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    echo "Downloading from: $SPEEDTEST_URL" && \
    curl -sSL "$SPEEDTEST_URL" -o /tmp/speedtest.tgz && \
    tar -xzf /tmp/speedtest.tgz -C /tmp && \
    mv /tmp/speedtest /usr/local/bin/speedtest && \
    chmod +x /usr/local/bin/speedtest && \
    rm -rf /tmp/speedtest.tgz /tmp/speedtest.md && \
    echo "Speedtest installed:" && \
    ls -la /usr/local/bin/speedtest && \
    speedtest --version

# Set working directory
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace config and lockfile from root
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json ./backend/

# Install backend dependencies only
RUN pnpm install --filter speedtest-logger-backend --frozen-lockfile

# Copy prisma schema
COPY backend/prisma ./backend/prisma

# Generate Prisma client
WORKDIR /app/backend
RUN pnpm exec prisma generate

# Copy backend source code
COPY backend ./

# Build TypeScript
RUN pnpm run build

# Expose port
EXPOSE 3001

# Start command with database sync
CMD ["sh", "-c", "pnpm exec prisma db push && pnpm start"]
