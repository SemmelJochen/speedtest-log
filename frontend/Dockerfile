# Frontend Dockerfile - SPA with nginx
FROM node:20-alpine AS builder

WORKDIR /app

# API URL is auto-detected at runtime from window.location.hostname
# Only set VITE_API_URL if you need to override the auto-detection
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci || npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage with nginx
FROM nginx:alpine AS runner

# Copy built files to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
