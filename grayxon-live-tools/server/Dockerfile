FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server/package.json ./package.json
RUN npm install --omit=dev
COPY server/index.js ./index.js
COPY index.html ./public/index.html
EXPOSE 3000
CMD ["node", "index.js"]