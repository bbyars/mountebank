mountebank
==========

mountebank is the first tool to provide multi-protocol, multi-language test doubles over the wire.
Just point your application under test to mountebank instead of the real dependency,
and test like you would with traditional stubs and mocks.

mountebank will tell you that he supports every protocol ever invented, and a few
lying in the weeds.  He will swear that he supports bindings in every language
known to humanity.  Some of the implementations are lagging, but worry not, for his
team of open source developers is legion.

At the moment, the following protocols are supported:
* http
* https
* tcp
* smtp

## Getting Started

[![NPM version](https://badge.fury.io/js/mountebank.png)](http://badge.fury.io/js/mountebank)

Install:

    npm install -g mountebank

Run:

    mb

Create a test double:

    cat << EOF > imposter.json
      {
        "port": 2526,
        "protocol": "http",
        "stubs": [{
          "responses": [
            { "is": { "statusCode": 400 }}
          ],
          "predicates": {
            "path": { "is": "/test" },
            "method": { "is": "POST" },
            "body": { "not": { "contains": "requiredField" } },
            "headers": {
              "Content-Type": { "is": "application/json" }
            }
          }
        }]
      }
    EOF

    curl -i -H 'Content-Type: application/json' -d@imposter.json http://localhost:2525/imposters

## Learn More

After installing, open your browser to http://localhost:2525, or visit the
[public site](http://mountebank.herokuapp.com/).


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
