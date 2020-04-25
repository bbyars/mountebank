FROM node:12

ARG version=2.2.0
RUN npm install -g mountebank@${version} --production

RUN mkdir /imposters
COPY ./imposters /imposters
VOLUME /imposters

WORKDIR /imposters

EXPOSE 2525

ENTRYPOINT ["mb"]
CMD ["start", "--configfile", "imposters.ejs"]

