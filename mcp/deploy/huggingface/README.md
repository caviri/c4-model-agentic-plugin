---
title: C4 Architecture Explorer MCP
emoji: 🧭
colorFrom: blue
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
license: apache-2.0
short_description: MCP server that builds C4 architecture explorers in chats
---

# C4 architecture explorer · MCP server

A remote MCP server (Streamable HTTP) from [c4-model-agentic-plugin](https://github.com/caviri/c4-model-agentic-plugin).
In ChatGPT or Claude it lets the assistant explore a public GitHub repository, write a C4 architecture model,
check it, export it as RDF, and show it as an interactive explorer inside the chat (an MCP Apps view).

- MCP endpoint: `https://<this-space>.hf.space/mcp`
- Health: `https://<this-space>.hf.space/healthz`
- Documentation: https://caviri.github.io/c4-model-agentic-plugin/mcp/

The server is stateless: it keeps nothing of the models it is sent. It fetches public GitHub content
(`api.github.com`, `raw.githubusercontent.com`) when asked, and caches it in memory for a few minutes.

Optional Space secrets: `GITHUB_TOKEN` (a fine-grained token with read-only access to public repositories, for a
higher GitHub API rate limit), `MCP_BEARER_TOKEN` (require `Authorization: Bearer <token>`), `RATE_LIMIT`
(requests per minute per client, default 120).
