FROM node:20-alpine
WORKDIR /app

# Copy DevState core server and local schema (standalone layout)
COPY server /app/state-manager
COPY docs/STATE.schema.json /app/state-manager/docs/STATE.schema.json

WORKDIR /app/state-manager
RUN npm install --omit=dev

ENV DEVSTATE_HTTP_PORT=3080
EXPOSE 3080

CMD ["node", "http-server.js"]
