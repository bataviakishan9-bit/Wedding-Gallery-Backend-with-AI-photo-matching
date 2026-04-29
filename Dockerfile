FROM node:20-bullseye

# Install canvas and tfjs-node dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-dev \
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
    curl -L -o models/ssd_mobilenetv1_model.bin https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/ssd_mobilenetv1_model.bin && \
    curl -L -o models/ssd_mobilenetv1_model.json https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/ssd_mobilenetv1_model.json && \
    curl -L -o models/face_landmark_68_model.bin https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/face_landmark_68_model.bin && \
    curl -L -o models/face_landmark_68_model.json https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/face_landmark_68_model.json && \
    curl -L -o models/face_recognition_model.bin https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/face_recognition_model.bin && \
    curl -L -o models/face_recognition_model.json https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/face_recognition_model.json

EXPOSE 10000

CMD ["node", "server.js"]
