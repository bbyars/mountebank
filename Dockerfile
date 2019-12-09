FROM node:12

COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 2525
CMD ["mb"]