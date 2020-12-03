FROM node:12-alpine

COPY package*.json ./
RUN npm install --production && npm cache clean -f
COPY . .

EXPOSE 2525
CMD ["mb"]
