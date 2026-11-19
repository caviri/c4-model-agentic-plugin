# C4 architecture explorer · MCP server (Streamable HTTP on /mcp), for any container host.
# The server reads the plugin's template, references and ontology, so the build context is the repository root:
#   docker build -f mcp/Dockerfile -t c4-explorer-mcp .
#   docker run --rm -p 7860:7860 c4-explorer-mcp            → http://localhost:7860/mcp
# Hugging Face Spaces (Docker SDK): see mcp/deploy/huggingface/, which builds the same image from a tagged release.
FROM node:22-slim

ENV NODE_ENV=production HOST=0.0.0.0 PORT=7860 TRUST_PROXY=1
WORKDIR /app

# dependencies first (cached layer); no dev dependencies, no install scripts
COPY mcp/package.json mcp/package-lock.json mcp/
RUN cd mcp && npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

# what the server reads from the plugin (paths as in the repository)
COPY skills/architecture-explorer/templates skills/architecture-explorer/templates
COPY skills/architecture-explorer/references skills/architecture-explorer/references
COPY skills/architecture-history/scripts/history-core.js skills/architecture-history/scripts/history-core.js
COPY skills/explore-project skills/explore-project
COPY ontology ontology
COPY examples/image-annotation-tool/communications/architecture-explorer/model.js examples/image-annotation-tool/communications/architecture-explorer/model.js
COPY examples/image-annotation-tool/communications/architecture-history/history.json examples/image-annotation-tool/communications/architecture-history/history.json
COPY mcp/server.mjs mcp/
COPY mcp/lib mcp/lib
COPY mcp/widget mcp/widget

# the image's "node" user (uid 1000, as Hugging Face Spaces expects)
USER node
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "mcp/server.mjs"]
