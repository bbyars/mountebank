# mountebank server

Here lies the brains of the operation.  mountebank happily accepts your
orders and delegates to his team of imposters.  While you are free to parlay with
mountebank through his RESTful API, he would prefer to converse in your native
language.  The API is [Esperanto](http://en.wikipedia.org/wiki/Esperanto), designed
with the goal to "create an easy-to-learn, politically neutral language that would
transcend nationality and foster peace and international understanding between people
with different languages."

## API

mountebank, being a man of the people, prefers the simple words of the vernacular over
the silvery speech of the priesthood.  As if to prove the point, he speaks in
`application/json` rather than `application\vnd.mountebank+json`.  While he does
provide hypermedia, it is more as a convenience to you, with no professorial dictate
that you follow the script provided.  For your viewing pleasure, all resources
and URL templates are here provided.

### Home

Unpretentious and welcoming, mirroring mountebank's simple good nature.  This endpoint
exists for those who aspire to the
[priesthood](http://martinfowler.com/articles/richardsonMaturityModel.html), though they
may be disappointed to find such a lowly language as `application/json` and the lack
of URLs for relationships.  mountebank has no intention of forcing anybody to use
this endpoint.

    GET / HTTP/1.1
    Host: localhost:2525
    Accept: application/json


    HTTP/1.1 200 OK
    Content-Type: application/json

    {
        "links": [
            {
                "href": "http://localhost:2525/imposters",
                "rel": "imposters"
            }
        ]
    }

### Imposters

Though he's not proud to admit it, mountebank employs a legion of imposters to
fulfill your orders.  Because your needs are varied and sundry, his imposters
are all different, and all are identified by a port number and associated with
a protocol.  mountebank expects that you will be responsible for providing the
port, as a convenience, of course, so that he doesn't grab a port that you
expect to use in the near future for another important need.  And the protocol
is all-important, as it describes which imposter to choose.  Of course,
mountebank knows all protocols, but some he doesn't quite have ready just yet.
Fortunately for you, his hordes of open source developers are working on it.

Perhaps you might start by creating an imposter:

    POST /imposters HTTP/1.1
    Host: localhost:2525
    Accept: application/json
    Content-Type: application/json

    {
        "port": 2526,
        "protocol": "HTTP"
    }


    HTTP/1.1 201 Created
    Location: http://localhost:2525/imposters/2526
    Content-Type: application/json

    {
        "protocol": "http",
        "port": 2526,
        "links": [
            { "href": "http://localhost:2525/imposters/2526", "rel": "self" },
            { "href": "http://localhost:2525/imposters/2526/requests", "rel": "requests" },
            { "href": "http://localhost:2525/imposters/2526/stubs", "rel": "stubs" }
        ]
    }

If you get lost, you can always ask for the same information again

    GET /imposters/2526 HTTP/1.1
    Host: localhost:2525
    Accept: application/json


    HTTP/1.1 200 OK
    Content-Type: application/json

    {
        "protocol": "http",
        "port": 2526,
        "links": [
            { "href": "http://localhost:2525/imposters/2526", "rel": "self" },
            { "href": "http://localhost:2525/imposters/2526/requests", "rel": "requests" },
            { "href": "http://localhost:2525/imposters/2526/stubs", "rel": "stubs" }
        ]
    }
