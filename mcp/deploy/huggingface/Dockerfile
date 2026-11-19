# C4 architecture explorer · MCP server, as a Hugging Face Space (Docker SDK).
# Put this file and README.md (its front matter configures the Space) at the root of a Space repository.
# It builds the server from a tagged release of the plugin, so the Space needs nothing else.
# The MCP endpoint is then https://<user>-<space>.hf.space/mcp
FROM node:22-slim

ARG REPO=https://github.com/caviri/c4-model-agentic-plugin.git
# pin a release tag or a commit for reproducible builds; "main" follows the default branch
ARG REF=main

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch "$REF" "$REPO" /app && rm -rf /app/.git /app/docs /app/examples/*/communications/project-deck
WORKDIR /app/mcp
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

ENV NODE_ENV=production HOST=0.0.0.0 PORT=7860 TRUST_PROXY=1
USER node
EXPOSE 7860
CMD ["node", "server.mjs"]
