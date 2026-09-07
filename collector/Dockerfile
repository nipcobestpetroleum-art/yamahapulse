FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY simulate.js ./

EXPOSE 5027

CMD ["node", "server.js"]