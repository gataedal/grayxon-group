FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY index.js ./index.js
COPY ../index.html /app/public/index.html
EXPOSE 3000
CMD ["node", "index.js"]