# Use stubIndex() to record proxy responoses

## Context

The original mountebank design involved everything being in memory. Adding a file-backed
database changed a number of assumptions. Originally, the stub position to add a new
saved proxy response was found by searching for the proxy response itself and using that
stub index. Since each response is stored in a separate file, this approach incurs poor
performance when using a persistent repository. The solution is to simply decorate the
`responseConfig` passed into the `responseResolver` with a `stubIndex` function, which
contains the index of the stub containing the proxy response.

## Consequences

This approach introduces two possible race conditions. I've examined both of them and decided
that the added complexity of avoiding the race conditions isn't worth it.

The first race condition occurs as follows:
* The system under test (SUT) calls mountebank, which proxies to the origin server
* Someone calls the mountebank API to, for example, overwrite all stubs, or insert one
  at a given index
* The origin server responds to mountebank, which then inserts the stub at the original
  result of stubIndex()

I don't care about this race condition because it involves a user manually changing the state
of the stubs array during proxy recording. This is bad behavior, and likely to cause other
bugs besides this one.

The second race condition involves multiple concurrent proxy requests returning out of order.
The results are somewhat different depending on which proxy mode we are using.

For `proxyOnce`, the `responseResolver` calls `stubs.insertAtIndex` using the result of the
`stubIndex()` call to decide the index. Semantically, this is designed to ensure that the new
stub is always created _before_ the stub with the proxy response. Let's examine what could go
wrong. Assume the following simplified stubs structure:

```
[
  { predicates-1, responses-1 },
  { responses-2-with-proxy }
]
```

In this example, `responses-2` is assumed to contain the `proxy` response. Now assume the
following sequence of events:
* `request-1` triggers a proxy call to the origin server, passing `stubIndex() === 1` into `responseResolver`
* `request-2` triggers a second proxy call to the origin server. Because the first proxy call hasn't resolved
  yet, again we pass `stubIndex() === 1` into `responseResolver.
* The origin server responds for the second request, and we insert the new stub at index 1. The stubs array now
  looks like:

```
[
  { predicates-1, responses-1 },
  { recorded-predicates-to-request-2, recorded-response-to-request-2 },
  { responses-2-with-proxy }
]
```

* The origin server responds to `request-1`, and we again insert it at index 1. The stubs array looks like this:

```
[
  { predicates-1, responses-1 },
  { recorded-predicates-to-request-1, recorded-response-to-request-1 },
  { recorded-predicates-to-request-2, recorded-response-to-request-2 },
  { responses-2-with-proxy }
]
```

This is correct behavior. Had the origin server responded in reverse order, it looks a little different:

```
[
  { predicates-1, responses-1 },
  { recorded-predicates-to-request-2, recorded-response-to-request-2 },
  { recorded-predicates-to-request-1, recorded-response-to-request-1 },
  { responses-2-with-proxy }
]
```

This looks fishy, but is semantically correct. All recorded stubs, with the appropriate predicates, are
before the proxy stub.

The story is similar for `proxyAlways`. Here, the `responseResolver` uses `stubIndex()` as a parameter to
a call to `stubs.first()` to find the first stub whose predicates match the generated predicate, starting
_after_ the proxy stub. Again assume a starting structure of two stubs:

```
[
  { predicates-1, responses-1 },
  { responses-2-with-proxy }
]
```

And the following sequence:
* `request-1` triggers a proxy call to the origin server, passing `stubIndex() === 1` into `responseResolver`
* `request-2` triggers a second proxy call to the origin server. Because the first proxy call hasn't resolved
  yet, again we pass `stubIndex() === 1` into `responseResolver.
* The origin server responds for the second request. We call `stubs.first()` starting at index 2, which doesn't exist,
  so we add a new stub. The stubs array now looks like:

```
[
  { predicates-1, responses-1 },
  { responses-2-with-proxy },
  { recorded-predicates-to-request-2, recorded-response-to-request-2 }
]
```

* Now the origin server responds to the first request. We again call `stubs.first()` starting at index 2. If
  the predicates don't match, a new stub is created:

```
[
  { predicates-1, responses-1 },
  { responses-2-with-proxy },
  { recorded-predicates-to-request-2, recorded-response-to-request-2 },
  { recorded-predicates-to-request-1, recorded-response-to-request-1 }
]
```

If the origin server responded in reverse order, again it doesn't matter. The semantics are obeyed. Two
stubs with incompatible predicates are added _after_ the proxy stub.

If instead, the predicates match, it's possible the responses are saved in reverse order:

```
[
  { predicates-1, responses-1 },
  { responses-2-with-proxy },
  { recorded-predicates-to-request-2, [recorded-response-to-request-2, recorded-response-to-request-1] }
]
```

As far as I can tell, this is the worst case scenario. But this worst case scenario existed even before,
when we started our search by looking for the proxy response rather than using `stubIndex()`. And this
worst case scenario is still semantically correct.

There's one more scenario to consider. Originally, I set the `stubIndex` function directly on the stub
during the call to the `first` function. The following race condition is possible (assuming the same
starting stubs arrangement):

```
[
  { predicates-1, responses-1 },
  { responses-2-with-proxy }
]
```

* `request-1` triggers a proxy to the downstream origin server. The stub is passed to the `responseResolver`
  with `stubIndex() === 1`
* `request-2` triggers a call the the origin server. The same stub is passed to the `responseResolver`
  with `stubIndex() === 1`
* The `request-1` call finishes. The stubs array now looks like (assuming `proxyOnce`):

```
[
  { predicates-1, responses-1 },
  { recorded-predicates-to-request-1, recorded-response-to-request-1 }
  { responses-2-with-proxy }
]
```

* `request-3` triggers a proxy call. That sets `stubIndex()` equal to `2`.
* The `request-2` call finishes, but since it uses the same stub instance throughout, `stubIndex()` now returns
  `2` instead of `1`. The stubs array now looks like:

```
[
  { predicates-1, responses-1 },
  { recorded-predicates-to-request-1, recorded-response-to-request-1 },
  { recorded-predicates-to-request-2, recorded-response-to-request-2 }
  { responses-2-with-proxy }
]
```

Again, this is semantically correct.

Based on this analysis, I've decided to leave `stubIndex` as the solution for recording proxy responses.
The alternative I can think of involves assigning a hidden `id` to each stub and using that as the starting
point. That solution is still vulnerable to out-of-order responses from the origin server, which could be
fixed if needed by adding some additional state around the original request order, but that seems like a lot
of complexity for no real semantic gain.
