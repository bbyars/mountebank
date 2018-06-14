FROM circleci/node:8.9.4-stretch

MAINTAINER Brandon Byars <brandon.byars@gmail.com>

RUN sudo apt-get update
RUN sudo apt-get install -y ruby-full
RUN sudo apt-get install -y rpm
RUN sudo rm -rf /var/lib/apt/lists/*

RUN sudo gem install bundler

CMD ["/bin/sh"]

# docker build -t=bbyars/mountebank-base-build:v1 .
# docker login
# docker push bbyars/mountebank-base-build:v1
