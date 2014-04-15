mountebank
==========

mountebank is the first tool to provide multi-protocol, multi-language test doubles over the wire.
Just point your application to mountebank instead of the real dependency,
and test like you would with traditional stubs and mocks.

At the moment, the following protocols are supported:
* http
* https
* tcp (text and binary)
* smtp

mountebank supports mock verification, stubbing with advanced predicates, JavaScript injection,
and record-playback through proxying.

[![how it works](https://github.com/bbyars/mountebank/blob/master/src/public/images/overview.gif?raw=true)](https://github.com/bbyars/mountebank/blob/master/src/public/images/overview.gif?raw=true)

See [getting started](http://www.mbtest.org/docs/gettingStarted) guide for more information.

## Install and Run

[![NPM version](https://badge.fury.io/js/mountebank.png)](http://badge.fury.io/js/mountebank)

Install:

    npm install -g mountebank --production

Run:

    mb

## Learn More

After installing and running, view the docs in your browser at http://localhost:2525, or visit the
[public site](http://www.mbtest.org/).

## Goals

mountebank has the following goals:

* Trivial to get started
    * mountebank is easy to install, without any platform dependencies.  mountebank aims for fun and comprehensive documentation with lots of examples, and a nice UI that lets you explore the API interactively.
* A platform, not just a tool
    * mountebank aims to be fully cross-platform, with native language bindings.  Servers are extensible through scripting.
* Powerful
    * mountebank is the only stubbing tool that is non-modal and multi-protocol.  mountebank does not just pretend to be a server; he spins up real servers.

Not all of mountebank's goals are currently implemented, but fear not, for he has a team of top-notch open source developers, and they are legion.

## Support

Visit the [Google group](https://groups.google.com/forum/#!forum/mountebank-discusshttps://groups.google.com/forum/#!forum/mountebank-discuss)
for any support questions.  Don't be shy!

## Building

[![Build Status](https://travis-ci.org/bbyars/mountebank.png)](https://travis-ci.org/bbyars/mountebank)
[![Coverage Status](https://coveralls.io/repos/bbyars/mountebank/badge.png?branch=master)](https://coveralls.io/r/bbyars/mountebank?branch=master)
[![Dependency Status](https://gemnasium.com/bbyars/mountebank.png)](https://gemnasium.com/bbyars/mountebank.png)

`./build` should do the trick.  If not, yell at me.  At the moment I've tested on OS X and Linux.
I test on node 0.10 (I used to test on node 0.8 as well, but struggled getting my Travis deployments
working with both in the build matrix).

## Contributing

Contributions are welcome (see TODO.md for my own open loops, although I welcome other ideas).
Some tips for contributing are in the contributing link that spins up when you run mb.
You can reach me at brandon.byars@gmail.com.
