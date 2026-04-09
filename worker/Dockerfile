FROM node:22-slim

# Install git and Claude Code CLI
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY *.ts tsconfig.json ./

CMD ["npx", "tsx", "index.ts"]
