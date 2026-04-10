FROM node:22-slim

# Install git and Claude Code CLI (pinned version)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code@1.0.0

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY *.ts tsconfig.json ./

# Run as non-root user
RUN adduser --disabled-password --gecos '' worker
USER worker

CMD ["npx", "tsx", "index.ts"]
