#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Speedtest Logger - Development Environment${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check for pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}Error: pnpm is not installed${NC}"
    echo "Install with: npm install -g pnpm"
    exit 1
fi

# Check for docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: docker is not installed${NC}"
    exit 1
fi

# Create backend .env if not exists
if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}Creating backend/.env from example...${NC}"
    cp backend/.env.example backend/.env
fi

# Start PostgreSQL
echo -e "${GREEN}▶ Starting PostgreSQL...${NC}"
docker compose -f docker-compose.dev.yml up -d

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}⏳ Waiting for PostgreSQL to be ready...${NC}"
until docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U speedtest > /dev/null 2>&1; do
    sleep 1
done
echo -e "${GREEN}✓ PostgreSQL is ready${NC}"

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
    echo -e "${GREEN}▶ Installing dependencies...${NC}"
    pnpm install
fi

# Generate Prisma client
echo -e "${GREEN}▶ Generating Prisma client...${NC}"
pnpm db:generate

# Run database migrations
echo -e "${GREEN}▶ Running database migrations...${NC}"
pnpm db:push

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}▶ Starting development servers...${NC}"
echo -e "  ${BLUE}Backend:${NC}  http://localhost:3001"
echo -e "  ${BLUE}Frontend:${NC} http://localhost:5173"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Run backend and frontend concurrently
pnpm exec concurrently \
    --names "backend,frontend" \
    --prefix-colors "blue,magenta" \
    "pnpm dev:backend" \
    "pnpm dev:frontend"
