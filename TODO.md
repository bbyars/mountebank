Stories/Tasks
=============

1. Evaluate Snap CI for manual deployment, x-platform stuff
4. add ssh
5. add behaviors: { _behaviors: { wait: 5000 } } to responses
6. Add MSI and Windows support
7. Add SMTP stubbing behavior (_behaviors: { accept: true })
8. Add http attachment support
9. Allow regex tokens from request params in response (different resolver?)
3. Add brew package
10. Prettier /imposters HTML page
11. Ability to create imposter from UI for manual testers
12. Prettier /imposter/{port} HTML page
13. paging and q= filtering for imposters on GET /imposters
14. javadoc style documentation? (jsdoc3, or http://jashkenas.github.io/docco/)
16. Change logs page to link the [http:2526] to the imposter page
  - would need to add createdAt field to imposter, and only link to imposters created after the timestamp
17. Pretty print JSON log messages on /logs page
17. Add paging for the logs page
18. Have query param on GET /imposters/{port} that returns slimmest possible payload to replay the imposter
        - exclude matches and requests
19. Add atom feed that only displays when --heroku is set that people can subscribe to for updates
20. dry run all stub resolvers, even if predicates fail or is second in the responses array
21. Allow accessing imposter by name on URL
22. Set up bare domain (mbtest.org, instead of www.mbtest.org) for heroku
      - I don't think godaddy lets me do this; may have to transfer DNS
22. Fix for node 0.8
  - replace Buffer.toJSON with Buffer.toString('hex')
  - but a few other unexplained errors remain

Examples Needed
===============
1. REST
2. SOAP
3. RMI
4. CORBA
5. .NET Remoting
6. DCOM

Known Bugs
==========
1. grunt does not kill mb if functional tests fail
2. TCP proxying doesn't work if proxied server doesn't send a response
   - add a timeout parameter, and always resolve if no response by that time?
3. Tests must have some race conditions; getting intermittent failures

Rainy day ideas to try out
=================================
The ideas below aren't guaranteed to be good ;>

1. Use cluster module to isolate imposters from each other?
  - the process start up time on Windows may make this too painful
2. UDP and TCP syslog support (see http://en.wikipedia.org/wiki/Syslog for packet format)
3. Add button next to code blocks on docs site that allows user to directly execute and compare the results
4. SOAP-specific support as a separate protocol
