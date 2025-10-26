# Dockerfile
# Debian-based image with Node.js, Python, ffmpeg, and faster-whisper

FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm ci --only=production || npm install --only=production

# Install Python dependencies
RUN pip3 install --no-cache-dir --break-system-packages faster-whisper==1.0.3

# Copy application code
COPY src/ ./src/

# Create data directory for user storage
RUN mkdir -p /app/data && chmod 777 /app/data

# Set environment variables for model caching
ENV HF_HOME=/app/.cache
ENV TRANSFORMERS_CACHE=/app/.cache
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:8080/_health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start application (run as root to allow /tmp writes)
CMD ["node", "src/server.js"]
