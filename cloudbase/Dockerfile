FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY cloudbase/package.json cloudbase/package-lock.json ./cloudbase/
RUN cd cloudbase && npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node cloudbase/server.mjs cloudbase/start.mjs cloudbase/quota.mjs cloudbase/cloudbase-store.mjs cloudbase/session.mjs ./cloudbase/
COPY --chown=node:node plugin-prototype/vision-analyzer.mjs plugin-prototype/developer-settings.mjs plugin-prototype/analysis-contract.mjs plugin-prototype/prompt-model.mjs plugin-prototype/analysis-instructions.md plugin-prototype/analysis-instructions-v2.md ./plugin-prototype/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "cloudbase/start.mjs"]
