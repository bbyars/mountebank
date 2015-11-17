Contributing to mountebank
==========================

Congratulations!  You're here because you want to join the millions of open source developers
contributing to mountebank.  The good news is contributing is an easy process.  In fact, you don't
even have to write code to contribute.  I am grateful for all of the following contributions:

* Submitting an issue, either through github or the [support page](http://www.mbtest.org/support)
* Making a suggestion
* Letting me know that you're using mountebank and how you're using it.  It's surprisingly hard to find
that out with open source projects, and provides healthy motivation.  Feel free to email at
brandon.byars@gmail.com
* Writing about mountebank (bonus points if you link to the [home page](http://www.mbtest.org/))
* Creating a how-to video about mountebank
* Speaking about mountebank in conferences or meetups
* Telling your friends about mountebank
* Starring and forking the repo
* Convincing your company to let me announce that they're using mountebank, including letting me put their logo
on a web page (I will never announce a company's usage of mountebank without their express permission).
* Writing a client library that hides the REST API under a language-specific API
* Writing a build plugin for (maven, gradle, MSBuild, rake, gulp, etc)

Still want to write some code?  Great!  You may want to keep the [source documentation](https://mountebank.firebaseapp.com/)
handy, and you may want to review [the issues](https://github.com/bbyars/mountebank/labels/up-for-grabs) that I suspect
are relatively easy to get up and going.  From there, you can choose the basic workflow or the advanced workflow
depending on your time commitment and level of interest.

## The Basic Workflow

* [Fork the repo](https://github.com/bbyars/mountebank#fork-destination-box) (you might as well star it while you're at it).
* Change some code.  Or add new code.  Or maybe delete some.
* Create a pull request

That's it!  Seriously.  I have an extraordinarily lenient policy for accepting pull requests, and once your pull
request is accepted, I'll mention you on the release notes and add you to the contributors section of the package.json
to memorialize your contribution for all eternity (feel free to add yourself in the pull request if you want).

If it breaks tests, and you're struggling to figure out why, create the pull request anyway.  I'll fix it.

If it violates some coding standards that you're unaware of, create the pull request anyway.  I'll fix it.

The only time I'll reject pull requests is when the code does something contrary to the design of mountebank, and
given that it would be very onerous for you to understand the entire design of the codebase, I'd much rather you
just assume your code is good and create the pull request.  I'll let you know if it doesn't work for some reason.

## The Advanced Workflow

* Run the build script before committing.  `./build` (Linux/Mac) or `build` (Windows) should do
the trick.  Unfortunately, there seem to be one or two tests that reliably fail on some people's machines
for reasons that I haven't figured out yet.  If you run a clean build and see a test failing, please let me
know on [the relevant issue](https://github.com/bbyars/mountebank/issues/101).
* Review basic coding standards described below.
* Reference the [relevant issue](https://github.com/bbyars/mountebank/issues) in your git commit message,
if appropriate

The first time you run the build, it will do an `npm install`.  If you run an `npm install -g grunt-cli` as well,
you can skip the full build on subsequent runs by just running `grunt`.

## Tests failing?

There are some tests that require network access (`grunt airplane` ignores them in case that offends your
moral sensibilities).  A few of these tests verify the correct behavior under DNS failures.  If your ISP
is kind enough to hijack the NXDOMAIN DNS response in an attempt to allow you to conveniently peruse their
advertising page, those tests will fail.  I suggest that, under such circumstances, you talk to your ISP
and let them know that their policies are causing mountebank tests to fail.

I am still fighting the occasional flaky test elsewhere as well.  If you find one, please
[report it](https://github.com/bbyars/mountebank/issues/101).

## Debugging

I was somewhat of a JavaScript newbie when I started mountebank.  If you're a pro, feel free to skip
this section, but if you're like me, you may find the tips below helpful:

* mocha decorates test functions with an `only` function, that allows you to isolate test runs
  to a single context or a single function.  This works on both `describe` blocks and on `it` functions.
  You'll notice that I use a `promiseIt` function for my asynchronous tests, which just wraps the `it`
  function with promise resolution and error handling.  `promiseIt` also accepts an `only` function, so you
  can do `promiseIt.only('test description', function () {/*...*/});`
* Debugging asynchronous code is hard.  I'm not too proud to use `console.log`, and neither should you be.
* The functional tests require a running instance of `mb`.  If you're struggling with a particular test,
  and you've isolated it using the `only` function, you may want to run `mb` with the `--loglevel debug`
  switch.  The additional logging exposes a number of API and socket events.

## Getting Help

The source documentation is always available at [Firebase](https://mountebank.firebaseapp.com/).

I'm also available via Skype or something similar for questions.  Feel free to reach me at brandon.byars@gmail.com

## Coding Guidelines

### JavaScript OO

Try to avoid using the `new` and `this` keyword, unless a third-party dependency requires it.  They
are poorly implemented (most JavaScript developers don't know what the `new` keyword does, and every
time I know it, I forget it 30 seconds later).  In a similar vein, prefer avoiding typical JavaScript
constructor functions and prototypes.

Instead prefer modules that return object literals.  If you need a creation function, prefer the name
`create`, although I've certainly abused that with layers and layers of creations in places that I'm none
too proud about.  Although I'm of mixed opinion on this, I've tended to capitalize objects with a `create`
method to emulate the style for standard JavaScript constructors.

If this style is new to you, you might want to check out a
[short presentation](http://usergroup.tv/videos/keeping-up-with-javascript) that
[Pete Hodgson](https://github.com/moredip) and I did demonstrating this style
(thanks to Pete for allowing the use of his deck and material).

### Dependency Injection

Early commits in mountebank's life included [mockery](https://github.com/mfncooper/mockery) to mock out
dependencies.  Despite the excellence of the library, I found the resultant code both harder to understand
and less testable.  Prefer passing dependencies into creation methods instead.

### Asynchronous Code

Use promises.  mountebank ships with [q](https://github.com/kriskowal/q) in the codebase.  The inimitable
[Pete Hodgson](http://blog.thepete.net) taught me how to
[test asynchronous JavaScript](http://martinfowler.com/articles/asyncJS.html) using promises.

### Backwards Compatibility

I've gone on record with the recommendation to avoid the API versioning if at all possible
([essay](http://martinfowler.com/articles/enterpriseREST.html#versioning)
 [presentation](http://www.infoq.com/presentations/constraints-api-rest-integration)).  I may make
some suggestions to any API changes you make in an effort to make them more
future-compatible.  You can help by thinking through any breaking changes you make and explaining the
reasons in the commit messages.

This applies mostly to the API, which is what I consider my public API for semantic versioning.  I try
to minimize disruption with the command line arguments, but am more likely to accept breaking changes there.

### Documentation Tests

The most comprehensive tests I have are embedded in the documentation.  Many of the request/response pairs
in the docs are tagged with HTML attributes that allow the `docsIntegrityTest` to verify that the docs
are in fact accurate.  I did this initially because I knew how lazy I am about documentation and thought this
would force me keep the docs up-to-date.  In practice, those tests have been far more valuable than simply
keeping my docs up-to-date.  They've been invaluable in catching high-level bugs.

They're also a royal pain to change when they fail.  I comment out many of the pages liberally in the test file
and use the `only` function to isolate when I'm dealing with broken tests there.  I also spit out the request and
response on test failures.  When I intend to change something (add fields, etc), I make sure through visual
inspection that the actual result is what I want, and can simply replace that block in the code.

### Aim for the broadest reach

Many development decisions implicitly frame a tradeoff between the developers of mountebank and the users.  Whenever I
recognize such a tradeoff, I always favor the users.  Here are a few examples, maybe you can think of more, or inform
me of ways to overcome these tradeoffs in a mutually agreeable manner:

* I stick to ES5 instead of ES6 to maintain compatibility with older versions of node
* I've kept mountebank monolithic rather than add protocols through plugins to make it easier to get started
* I've had to patch a certain node.js library call in node v0.10 to maintain support for that version.  I'll
  deprecate it when the node.js team deprecates it.
* The build and CI infrastructure is quite complex and a little slow, but I'd prefer that over releasing flaky software
* I aim for fairly comprehensive error handling with useful error messages to help users out
* Windows support can be painful at times, but it is a core platform for mountebank

### The Continuous Integration Pipeline

Looking at the [README](https://github.com/bbyars/mountebank#build-status) will show that I have a complex CI pipleline.
Currently it involves Travis CI, Appveyor, and Snap CI, although I may add or remove from that list as I continue to
try and improve the pipeline.  At the moment, a commit will trigger a Travis CI build, which in turn triggers the other
CI systems through API calls, ensuring a consistent version throughout.  I've had bugs in different operating systems,
in different versions of node, and in the packages available for download.  The CI system tests as many of those combinations
as I reasonably can.

Every successful build that isn't a pull request deploys to a [test site](http://mountebank-dev.herokuapp.com/) that will
have a link to the artifacts for that prerelease version.
