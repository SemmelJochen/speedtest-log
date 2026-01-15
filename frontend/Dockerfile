# Frontend Dockerfile - SPA with nginx
FROM node:20-alpine AS builder

WORKDIR /app

# Build argument for API URL (used at build time for client-side requests)
ARG VITE_API_URL=http://localhost:3001
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
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 3000;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # SPA routing - all routes to index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Expose port
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
