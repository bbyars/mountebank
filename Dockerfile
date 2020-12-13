FROM node:12-alpine

COPY package*.json ./
RUN npm install --production
COPY . .

EXPOSE 2525
CMD ["mb"]
