FROM node:24.21.0-bookworm-slim
RUN npm install --global --no-audit --no-fund @anthropic-ai/claude-code@2.1.311 && claude --version
ENTRYPOINT ["claude"]
