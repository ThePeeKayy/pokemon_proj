# Build stage
FROM node:20-bullseye AS builder

# Install C++ build tools
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    curl \
    git \
    libcurl4-openssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy frontend files ONLY
COPY frontend/package.json ./frontend/package.json
COPY frontend/pnpm-lock.yaml ./frontend/pnpm-lock.yaml
COPY frontend ./frontend

# Copy backend files ONLY
COPY backend/package.json ./backend/package.json
COPY backend/pnpm-lock.yaml ./backend/pnpm-lock.yaml
COPY backend ./backend

# Build frontend
WORKDIR /app/frontend
RUN npm install -g pnpm && pnpm install
RUN pnpm build

# Build backend
WORKDIR /app/backend
RUN npm install -g pnpm && pnpm install
RUN mkdir -p build && \
    cd build && \
    cmake -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release .. && \
    cmake --build . && \
    if [ -f ./metrics-benchmark ]; then ./metrics-benchmark; else echo "Build failed"; exit 1; fi && \
    cd ..

# Runtime stage
FROM node:20-bullseye

RUN apt-get update && apt-get install -y \
    libcurl4 \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/frontend/package.json ./frontend/package.json
COPY --from=builder /app/frontend/node_modules ./frontend/node_modules
COPY --from=builder /app/backend ./backend

WORKDIR /app/backend

RUN npm install -g pnpm && pnpm install --production

EXPOSE 3001 3000

CMD ["sh", "-c", "cd /app/frontend && npm run start & cd /app/backend && node server.js & wait"]