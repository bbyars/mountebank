Contributing to mountebank
==========================

Congratulations!  You're here because you want to join the millions of open source developers
contributing to mountebank.  The good news is contributing is an easy process.  You can choose
the basic workflow or the advanced workflow depending on your time commitment and level of interest.

## The Basic Workflow

* [Fork the repo](https://github.com/bbyars/mountebank#fork-destination-box) (you might as well star it while you're at it).
* Change some code.  Or add new code.  Or maybe delete some.
* Create a pull request

That's it!  Seriously.  I have an extraordinarily lenient policy for accepting pull requests, and once your pull
request is accepted, I'll mention you on the release notes and add you to the contributors section of the package.json
(feel free to add yourself during the pull request if you want).

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
* Review basic coding standards described on the [contributing page](http://www.mbtest.org/contributing)
* Reference the [relevant issue](https://github.com/bbyars/mountebank/issues) in your git commit message,
if appropriate

## Tests failing?

There are some tests that require network access (`grunt airplane` ignores them in case that offends your
moral sensibilities).  A few of these tests verify the correct behavior under DNS failures.  If your ISP
is kind enough to hijack the NXDOMAIN DNS response in an attempt to allow you to conveniently peruse their
advertising page, those tests will fail.  I suggest that, under such circumstances, you talk to your ISP
and let them know that their policies are causing mountebank tests to fail.

I am still fighting the occasional flaky test elsewhere as well.  If you find one, please
[report it](https://github.com/bbyars/mountebank/issues/101).

## Getting Help

The source documentation is always available at [netlify](http://mountebank.netlify.com/).  It should be
nearly up-to-date, but I'm on a free plan that limits the number of deploys per month.

I'm also available via Skype or something similar to help you get started.
Feel free to reach me at brandon.byars@gmail.com

## Other Ways to Help

You don't need to write code to help.  I am grateful for all of the following contributions:

* Submitting an issue, either through github or the [support page](http://www.mbtest.org/support)
* Making a suggestion
* Letting me know that you're using mountebank and how you're using it.  It's surprisingly hard to find
that out with open source projects, and provides healthy motivation
* Writing about mountebank (bonus points if you link to the [home page](http://www.mbtest.org/))
* Creating a how-to video about mountebank
* Speaking about mountebank in conferences or meetups
* Telling your friends about mountebank
* Writing a client library that hides the REST API under a language-specific API
* Writing a build plugin for (maven,gradle,MSBuild,rake,gulp,etc)

Let me know if you write an article or a project using mountebank and I'll link to it from the
[examples](http://www.mbtest.org/docs/examples) or [client libraries](http://www.mbtest.org/docs/clientLibraries)
page.
