FROM node:14-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --production && npm cache clean -f
COPY bin/ bin/
COPY src/ src/
COPY releases.json LICENSE README.md ./

EXPOSE 2525
ENTRYPOINT ["node", "bin/mb"]
