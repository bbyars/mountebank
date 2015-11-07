Contributing to mountebank
==========================

Congratulations!  You're here because you want to join the millions of open source developers
contributing to mountebank.  The good news is contributing is an easy process.  You can choose
the basic workflow or the advanced workflow depending on your time commitment and level of interest.

## The Basic Workflow

* [Fork the repo](https://github.com/bbyars/mountebank#fork-destination-box) (you might as well star it while you're at it).
* Change some code.  Or add new code.  Or maybe delete some.
* Create a pull request

That's it!  Seriously.  I have an extraordinarily lenient policy for accepting pull requests, and once you're pull
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

## Additional Notes

There are some tests that require network access (`grunt airplane` ignores them in case that offends your
moral sensibilities).  A few of these tests verify the correct behavior under DNS failures.  If your ISP
is kind enough to hijack the NXDOMAIN DNS response in an attempt to allow you to conveniently peruse their
advertising page, those tests will fail.  I suggest that, under such circumstances, you talk to your ISP
and let them know that their policies are causing mountebank tests to fail.

I'm also available via Skype or something similar to help you get started.
Feel free to reach me at brandon.byars@gmail.com
