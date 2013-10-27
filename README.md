mountebank
==========

mountebank is meant to deceive your app and let you trick it into letting you test it.
It achieves its mischievous aims by pretending to be something it is not, starting with
an SMTP server.  It's designed for functional testing, where you want to test your code
full-stack, but you don't want your tests to fail because environmental conditions.

## Prerequisites

mountebank is composed of two parts: a server that sits in for the third party web service,
and client bindings.  The server is written using [node.js](http://nodejs.org/).  The client
bindings are written in whatever language you are using.

Node.js is the only dependency to get the server up and running.  Node.js will work on any
unix-like platform (including cygwin).  The easiest way to install it is probably you're
package manager (e.g. `brew install node`).  [nvm](https://github.com/creationix/nvm) allows
you to install multiple versions of node and quickly switch versions.

## Contributing

Contributions are welcome (see TODO for my own open loops, although I welcome other ideas).
You can reach me at brandon.byars@gmail.com.
