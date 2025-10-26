# Dockerfile for LeadLeader
FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --only=production

# Copy source
COPY . .

ENV NODE_ENV=production
ENV PORT=${PORT:-8080}

EXPOSE 8080

# Run as non-root
USER node

CMD ["node", "index.js"]
