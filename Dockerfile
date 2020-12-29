FROM node:14-alpine

WORKDIR /app
COPY bin/ bin/
COPY src/ src/
COPY package*.json releases.json LICENSE README.md ./
RUN npm install --production && npm cache clean -f

EXPOSE 2525
ENTRYPOINT ["node", "bin/mb"]
