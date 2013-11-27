== Contributing ==

mountebank has ambitious goals, and welcomes anyone willing to join his army of open source developers.
For his own open loops, visit the TODO file, in which he keeps up-to-date as he works.  However, he welcomes
other ideas.

mountebank wants to keep the bar for contribution quite low and make it as pleasant an experience for developers
as it is for users.  There are just a few minor tips

=== JavaScript OO ===

mountebank loves JavaScript, but he is not a learned man, and parts of the language confuse him.  In particular,
the `new` and `this` keywords are prone to cause problems with someone of mountebank's limited understanding.

Many of mountebank's modules have constructors of sorts, although the priesthood of JavaScript developers may
scorn them.  He calls the constructor method `create`, and often exposes that as the only method from a module.
In typical JavaScript fashion, he names variables of the module itself with a capital first letter.  See
mountebank.js for an example, with the constructors `require`d in at the top.

=== Dependency Injection ===

node's `require` function serves a dual purpose, and mountebank initially fell into the trap of failing to
distinguish between those purposes.  First, it is used to request a module from node's package management system.
Second, it is used to include a dependency in a module.

mountebank humbly requests that you consider whether the design would best be served by using constructor
dependency injection.  mountebank finds that it keeps the code clean, and makes the code more testable.
He did initially play with [mockery](https://github.com/mfncooper/mockery) to avoid dependency injection, and
found both the code and tests harder to understand.

=== Asynchronous Code ===

mountebank asks that you use promises.  He has included [Q](https://github.com/kriskowal/q) in the codebase.

=== Testing ===

mountebank provides a testing tool, and as such, strongly desires that his own code does a good job of testing.
He is a believer in the [testing pyramid](http://martinfowler.com/bliki/TestPyramid.html), and has two levels
in his own code.  The unit tests do not block, and the functional tests generally rely on a running instance
of `mb`.

mountebank learned how to unit test asynchronous JavaScript code from
[Pete Hodgson](http://martinfowler.com/articles/asyncJS.html), who took the time to show how to unit test
the impostersController code in this very codebase.  mountebank asks that you unit test the asynchronous bits
as best as you are able.  Perhaps the test/controllers/impostersControllerTest.js would provide some good examples?

mountebank himself has failed to find convenient ways to unit test some of the code that directly interfaces
with node - mountebank.js and models/http/server.js in particular.  He welcomes suggestions, but doesn't
feel bad about it, and neither should you.

=== Appearances ===

mountebank is deeply concerned with superficial appearances, and has take some pains to ensure that the code
remains pleasing to gaze upon.  He knows this is silly, and does not wish to discourage submissions because
of his obsession.

mountebank has two hooks baked into the build script to help enforce surface integrity.  First, he calls
bin/normalizeWhitespace, which destructively removes trailing whitespace.  He's considered extending it to
strip out tabs and ensure that there is one and only one newline at the end of each file.  However, he's also
concerned that having a destructive script like that called during every build is a bit dangerous, and would
happily entertain other suggestions.

Additionally, mountebank has taken Douglas Crockford's suggestion of using a space between the `function` keyword
and its argument list for function declarations, and no space between them for function calls.  bin/jscheck
validates that convention, and will fail the build if it is not obeyed.

A few other static analysis rules are configured through jshint in the `Gruntfile.js`.  If they impede your
ability to commit a good change, mountebank is happy for you to reconfigure them.

Finally, some people object to the lack of a .sh suffix to his shell scripts and a lack of .js suffix on his
node scripts.  mountebank does not believe you should care which language his command line script was
implemented in, and reserves the right to change it in the future.  He intends to do so in a way
transparent to users, and file extensions hinder that ability.
