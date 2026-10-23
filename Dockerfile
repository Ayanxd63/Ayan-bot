FROM node:20-slim

# ffmpeg is required for stickers; git for some npm deps
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

ENV NODE_ENV=production PORT=3000
EXPOSE 3000

# pm2-runtime keeps the process supervised inside the container
CMD ["npx", "pm2-runtime", "start", "ecosystem.config.js"]
