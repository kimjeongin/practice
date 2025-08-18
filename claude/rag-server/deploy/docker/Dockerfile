# Multi-stage Dockerfile for cross-platform builds
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-slim as base

# Install system dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml* ./

# Install pnpm globally
RUN npm install -g pnpm@9.0.0

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the project
RUN pnpm build

# Development stage
FROM base as development
EXPOSE 3000
CMD ["pnpm", "dev"]

# Production stage
FROM base as production
ENV NODE_ENV=production
CMD ["pnpm", "start"]

# Build stage for executables
FROM base as build-executable
ARG TARGET_PLATFORM=linux
RUN pnpm run bundle:${TARGET_PLATFORM}