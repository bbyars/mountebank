FROM node:12

ENV MOUNTEBANK_VERSION=2.2.0
RUN npm install -g mountebank@${MOUNTEBANK_VERSION} --production

RUN mkdir /imposters
COPY ./imposters /imposters
VOLUME /imposters

WORKDIR /imposters

EXPOSE 2525

ENTRYPOINT ["mb"]
CMD ["start", "--configfile", "imposters.ejs"]

