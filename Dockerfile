FROM node:14-alpine

COPY package*.json bin src releases.json ./
RUN npm install --production && npm cache clean -f

EXPOSE 2525
CMD ["mb"]
