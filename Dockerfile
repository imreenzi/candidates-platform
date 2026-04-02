FROM node:20-alpine
WORKDIR /workspace/api
COPY api/package*.json ./
RUN npm install --production
COPY api/ .
COPY web/ /workspace/web/
EXPOSE 3001
CMD ["node", "src/server.js"]
