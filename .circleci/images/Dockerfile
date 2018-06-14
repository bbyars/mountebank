FROM circleci/node:8.9.4-stretch

MAINTAINER Brandon Byars <brandon.byars@gmail.com>

USER root

RUN apt-get update
RUN apt-get install -y ruby-full
RUN apt-get install -y rpm
RUN rm -rf /var/lib/apt/lists/*

RUN gem install bundler

CMD ["/bin/sh"]

# docker build -t=bbyars/mountebank-base-build:v1 .
# docker login
# docker push bbyars/mountebank-base-build:v1
