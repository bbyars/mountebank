mountebank
==========

mountebank is the first open source tool to provide cross-platform, multi-protocol test doubles over the wire.
Just point your application to mountebank instead of the real dependency,
and test like you would with traditional stubs and mocks.

At the moment, the following protocols are supported:
* http
* https
* tcp (text and binary)
* smtp

mountebank supports mock verification, stubbing with advanced predicates, JavaScript injection,
and record-playback through proxying.

![how it works](https://github.com/bbyars/mountebank/blob/master/src/public/images/overview.gif?raw=true)

See [getting started](http://www.mbtest.org/docs/gettingStarted) guide for more information.

## Install and Run

[![npm][npm-badge]][npm]

Install:

    npm install -g mountebank

The npm install requires at least node 0.10.  Billions of other install options are
[also available](http://www.mbtest.org/docs/install) with no platform dependencies.

Run:

    mb

## Learn More

After installing and running, view the docs in your browser at http://localhost:2525, or visit the
[public site](http://www.mbtest.org/).

## Goals

mountebank has the following goals:

* Trivial to get started
    * mountebank is easy to install, without any platform dependencies.  mountebank aims for fun and comprehensive
     documentation with lots of examples, and a nice UI that lets you explore the API interactively.
* A platform, not just a tool
    * mountebank aims to be fully cross-platform, with native language bindings.  Servers are extensible through scripting.
* Powerful
    * mountebank is the only open source stubbing tool that is non-modal and multi-protocol.  Commercial
    "service virtualization" solutions exist, but their licensed platforms make it hard to move the tests
    closer to development and can even require a specialized IDE.  mountebank provides service virtualization free
    of charge without any platform constraints.

Not all of mountebank's goals are currently implemented, but fear not, for he has a team of top-notch open
source developers, and they are legion.

## Support

Visit the [Google group](https://groups.google.com/forum/#!forum/mountebank-discuss)
for any support questions.  Don't be shy!

## Build Status

[![Coverage Status][coveralls-badge]][coveralls]
[![Codacy Badge][codacy-badge]][codacy]

|                       |Ubuntu 12.04                             |CentOS 6.7                            |OS X Mavericks                           |Windows Server 2012                          |
|-----------------------|:---------------------------------------:|:------------------------------------:|:---------------------------------------:|:-------------------------------------------:|
|npm (node v5.0)        | [![Build Status][travis-badge]][travis] | (not tested)                         | [![Build Status][travis-badge]][travis] | [![Build status][appveyor-badge]][appveyor] |
|npm (node v4.2)        | [![Build Status][travis-badge]][travis] | (not tested)                         | [![Build Status][travis-badge]][travis] | [![Build status][appveyor-badge]][appveyor] |
|npm (node v4.0)        | [![Build Status][travis-badge]][travis] | (not tested)                         | (not tested)                            | (not tested)                                |
|npm (node v0.12)       | [![Build Status][travis-badge]][travis] | (not tested)                         | [![Build Status][travis-badge]][travis] | [![Build status][appveyor-badge]][appveyor] |
|npm (node v0.10)       | [![Build Status][travis-badge]][travis] | (not tested)                         | [![Build Status][travis-badge]][travis] | [![Build status][appveyor-badge]][appveyor] |
|OS package             | [![Build Status][travis-badge]][travis] | [![Build Status][snap-badge]][snap]  | [![Build Status][travis-badge]][travis] | N/A                                         |
|Self-contained archive | [![Build Status][travis-badge]][travis] | (not tested)                         | [![Build Status][travis-badge]][travis] | [![Build status][appveyor-badge]][appveyor] |
|(Performance)          | [![Build Status][travis-badge]][travis] | (not tested)                         | (not tested)                            | (not tested)                                |

[npm-badge]: https://nodei.co/npm/mountebank.png?downloads=true&downloadRank=true&stars=true
[npm]: https://www.npmjs.com/package/mountebank
[coveralls-badge]: https://coveralls.io/repos/bbyars/mountebank/badge.png?branch=master
[coveralls]: https://coveralls.io/r/bbyars/mountebank?branch=master
[codacy-badge]: https://www.codacy.com/project/badge/c030a6aebe274e21b4ce11a74e01fa12
[codacy]: https://www.codacy.com/public/brandonbyars/mountebank
[travis-badge]: https://travis-ci.org/bbyars/mountebank.png
[travis]: https://travis-ci.org/bbyars/mountebank
[appveyor-badge]: https://ci.appveyor.com/api/projects/status/acfhg44px95s4pk5?svg=true
[appveyor]: https://ci.appveyor.com/project/bbyars/mountebank
[snap-badge]: https://img.shields.io/snap-ci/bbyars/mountebank/master.svg
[snap]: https://snap-ci.com/bbyars/mountebank/branch/master
