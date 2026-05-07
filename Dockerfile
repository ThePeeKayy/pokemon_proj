# Build stage
FROM node:18-bullseye AS builder

# Install C++ build tools
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    curl \
    libcurl4-openssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend
COPY backend ./backend

WORKDIR /app/backend

# Install Node dependencies
RUN npm install -g pnpm && pnpm install

# Build C++ executable
RUN mkdir -p build && \
    cd build && \
    cmake -G "Unix Makefiles" .. && \
    cmake --build . && \
    cd ..

# Runtime stage
FROM node:18-bullseye

# Install only runtime dependencies (smaller image)
RUN apt-get update && apt-get install -y \
    libcurl4-openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only built backend from builder
COPY --from=builder /app/backend ./backend

# Copy frontend (if exists)
COPY frontend ./frontend

WORKDIR /app/backend

# Install production dependencies only
RUN npm install -g pnpm && pnpm install --production

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "server.js"]