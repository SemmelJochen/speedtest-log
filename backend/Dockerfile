# Backend Dockerfile with Speedtest CLI
FROM node:20-alpine

# Install dependencies for speedtest-cli and Prisma
RUN apk add --no-cache curl ca-certificates openssl

# Install Ookla Speedtest CLI manually (packagecloud script has issues with Alpine)
# Detect architecture and download appropriate binary
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        SPEEDTEST_URL="https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-linux-x86_64.tgz"; \
    elif [ "$ARCH" = "aarch64" ]; then \
        SPEEDTEST_URL="https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-linux-aarch64.tgz"; \
    elif [ "$ARCH" = "armv7l" ]; then \
        SPEEDTEST_URL="https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-linux-armhf.tgz"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    curl -sSL "$SPEEDTEST_URL" -o /tmp/speedtest.tgz && \
    tar -xzf /tmp/speedtest.tgz -C /tmp && \
    mv /tmp/speedtest /usr/local/bin/speedtest && \
    chmod +x /usr/local/bin/speedtest && \
    rm -rf /tmp/speedtest.tgz /tmp/speedtest.md

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy prisma schema
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3001

# Start command with database sync
CMD ["sh", "-c", "npx prisma db push && npm start"]
