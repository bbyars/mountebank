mountebank
==========

mountebank is a liar and a fraud.  He will pretend to do everything that your
application asks of him, while actually doing only as little as your tests tell him to.
One of mountebank's gimmicks is that he doesn't ask your application to change
anything, except perhaps a few lines of configuration defining external
dependencies.

mountebank will tell you that he supports every protocol ever invented, and a few
lying in the weeds.  He will swear that he supports bindings in every language
known to humanity.  Some of the implementations are lagging, but worry not, for his
team of open source developers is legion.

## Goals

mountebank knows that first impressions are everything.  He knows how annoyed you get
when developing in .NET on Windows, and have to install a JDK just to use some testing
tool, or are doing a JavaScript project and have to install the right version of ruby
only to generate the CSS.  mountebank therefore will ensure you can keep the dirt out
of your fingernails to use his product, and will deliver it to you via brew, or nuget,
or apt-get.  He also knows your desire to translate his product to your native language.
mountebank promises that he will do all these things.  Not yet of course, but his hordes
of open source developers are working on it.

mountebank wants you to have a good experience, but don't expect him to do too much.
He knows that other products will sell you a toaster and give you a full oven.
mountebank has a more machiavellian aim.  He wants to sell you an entire kitchen and give you
a fork.  He will provide a robust set of primitives, but any advanced interactions will
have to be handled through code injection.

mountebank sees tremendous opportunity in the Uncharted Territories.  To some degree, this
is verification mocking for HTTP.  To a larger degree, this is verification mocking across
other protocols.  He will provide excellent and first class HTTP stubs, because he knows you
already know and expect such functionality, but it's not where his heart lies.

## Installation

While his goals remain momentarily unfulfilled, mountebank humbly asks you to recognize
[node.js](http://nodejs.org/) as a dependency.  Once you've installed node using your
package manager of choice, `npm install -g mountebank` will install the
[server](https://github.com/bbyars/mountebank/blob/master/API.md).

The native language bindings are coming, of course.

## Running

mountebank does not require that you say his full name, or even be able to pronounce it.
`mb` works, because `mb` is the soul of wit.

Once installed, `mb` will start the server on port 2525.  The `mb` command accepts the following
options:

    mb start --port 8000

starts the server on the provided port

    mb stop

stops the server

    mb start --pidfile first.pid --port 8000
    mb start --pidfile second.pid --port 8001

allows multiple servers to be managed with the `mb` command, for instance:

    mb restart --pidfile first.pid
    mb stop --pidfile second.pid

## Building
[![Build Status](https://travis-ci.org/bbyars/mountebank.png)](https://travis-ci.org/bbyars/mountebank)
[![Coverage Status](https://coveralls.io/repos/bbyars/mountebank/badge.png?branch=master)](https://coveralls.io/r/bbyars/mountebank?branch=master)
[![Dependency Status](https://gemnasium.com/bbyars/mountebank.png)](https://gemnasium.com/bbyars/mountebank.png)

`./build` should do the trick.  If not, yell at me.  At the moment I've tested on OS X and Linux.
Windows support is coming.

## Contributing

Contributions are welcome (see TODO.md for my own open loops, although I welcome other ideas).
Some tips for contributing are in CONTRIBUTING.md), but they are guidelines and not hard and
fast rules.
You can reach me at brandon.byars@gmail.com.
