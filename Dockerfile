FROM node:8.11.3

LABEL maintainer Brandon Byars <brandon.byars@gmail.com>

USER node
RUN mkdir /home/node/mountebank
WORKDIR /home/node/mountebank

COPY --chown=node:node package.json .
COPY --chown=node:node package-lock.json .
RUN npm install --production
COPY --chown=node:node releases.json .
COPY --chown=node:node bin ./bin
COPY --chown=node:node README.md .
COPY --chown=node:node LICENSE .
COPY --chown=node:node src ./src

ENTRYPOINT ["node", "bin/mb"]
