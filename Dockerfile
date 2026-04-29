FROM node:20-bullseye

# Install canvas dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    libpixman-1-dev \
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
