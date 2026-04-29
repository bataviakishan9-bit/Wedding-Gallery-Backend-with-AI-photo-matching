FROM node:20-slim

# Install canvas dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Download face-api models
RUN mkdir -p models && \
    node -e "console.log('Models directory created')"

EXPOSE 10000

CMD ["node", "server.js"]
