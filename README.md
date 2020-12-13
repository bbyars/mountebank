# Welcome, friend

mountebank is the only open source service virtualization tool that competes with the commercial offerings
in terms of protocol diversity, capability, and performance. Here's what
[Capital One wrote](https://medium.com/capital-one-tech/moving-one-of-capital-ones-largest-customer-facing-apps-to-aws-668d797af6fc)
about their mobile cloud migration (emphasis theirs):

>In fact, halfway through we discovered our corporate mocking software couldn’t handle the
>sheer amount of performance testing we were running as part of this effort (_we completely crushed
>some pretty industrial enterprise software in the process_). As a result, we made the call to move
>the entire program over to a Mountebank OSS-based solution with a custom provision to give us the ability
>to expand/shrink our mocking needs on demand.

At the moment, the following protocols are supported:
* http
* https
* tcp (text and binary)
* smtp

mountebank supports mock verification, stubbing with advanced predicates, JavaScript injection,
and record-playback through proxying. It also supports extensions that allow you to build custom
protocol implementations in the language of your choice.

![how it works](https://github.com/bbyars/mountebank/blob/master/src/public/images/overview.gif?raw=true)

See [getting started](https://www.mbtest.org/docs/gettingStarted) guide for more information.

## Install and Run

Install:

    npm install -g mountebank

Billions of other install options are [also available](https://www.mbtest.org/docs/install) with no platform dependencies.

Run:

    mb

There are a number of [command line options](https://www.mbtest.org/docs/commandLine) if you need
to customize mountebank.

## Learn More

After installing and running, view the docs in your browser at <http://localhost:2525>, or visit the
[public site](https://www.mbtest.org/).

You can always learn more and support mountebank development by buying the book:

[![Testing Microservices with Mountebank](https://github.com/bbyars/mountebank/blob/master/src/public/images/book.jpg)](https://www.manning.com/books/testing-microservices-with-mountebank?a_aid=mb&a_bid=ee3288f4)

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

## Roadmap and Support

mountebank is used by a large number of companies and I think it's important to convey my best guess as to what
the feature roadmap is. I've adopted GitHub tools to manage the roadmap. Specifically, the
[Roadmap project](https://github.com/bbyars/mountebank/projects/9) page shows the features by release. I generally
re-prioritize and update the ETAs each release.

Visit the [Google group](https://groups.google.com/forum/#!forum/mountebank-discuss)
for any support questions.  Don't be shy!

mountebank is provided free of charge and maintained in my free time. As such, I'm unable to make any kind
of guarantees around either support turn-around time or release dates. If your company has commitments
that require more confidence and are willing to pay a reasonable services fee to obtain that confidence,
you can contact me directly at brandon.byars@gmail.com.

## Building

`./build` should do the trick on Mac and Linux, and `build.bat` on Windows, assuming you have a supported version
of node. If not, yell at me.

There are some tests that require network access (`grunt airplane` ignores them in case that offends your
moral sensibilities).  A few of these tests verify the correct behavior under DNS failures.  If your ISP
is kind enough to hijack the NXDOMAIN DNS response in an attempt to allow you to conveniently peruse their
advertising page, those tests will fail.  I suggest that, under such circumstances, you talk to your ISP
and let them know that their policies are causing mountebank tests to fail. You can also run `grunt airplane`,
which will avoid tests requiring your DNS resolver.

## Contributing

Contributions are welcome!
Some tips for contributing are in the [CONTRIBUTING.md](https://github.com/bbyars/mountebank/blob/master/CONTRIBUTING.md).
While I've done my best to maintain a healthy codebase, mountebank is now several years old, If you're interested in
contributing but need some pointers to understand the code, feel free to reach me at brandon.byars@gmail.com.

[npm-badge]: https://nodei.co/npm/mountebank.png?downloads=true&downloadRank=true&stars=true
[npm]: https://www.npmjs.com/package/mountebank
[codeclimate-badge]: https://codeclimate.com/github/bbyars/mountebank/badges/gpa.svg
[codeclimate]: https://codeclimate.com/github/bbyars/mountebank
[codeclimate-coverage-badge]: https://codeclimate.com/github/bbyars/mountebank/badges/coverage.svg
[codeclimate-coverage]: https://codeclimate.com/github/bbyars/mountebank/coverage
[travis-badge]: https://travis-ci.org/bbyars/mountebank.png
[travis]: https://travis-ci.org/bbyars/mountebank
[appveyor-badge]: https://ci.appveyor.com/api/projects/status/acfhg44px95s4pk5?svg=true
[appveyor]: https://ci.appveyor.com/project/bbyars/mountebank
