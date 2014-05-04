Releasing
=========

Travis.ci does most of the work, but not all.  I'd like to experiment with Snap CI to see if it
can satisfy the cross-platform pipeline requirements, and give a manual deploy.

# Make sure the previous build passes in https://travis-ci.org/bbyars/mountebank
# Review major / minor version.  If an increment is needed, change the LAST_PATCH_OF_PRIOR_VERSION
  variable of the build script to the latest build in travis to reset the patch.
# Update the ATOM feed with release notes
# Change the version id of the latest ATOM entry to the static version number.  It may be dynamic only
  to allow me to test on the test site through feedly.
# Change the views/releases/vx.x.x filename
# Change the updated date of both the last entry and the feed
# (until I fix the heroku buildpack for www.mbtest.org) change package.json to the next patch version.
# commit
# tag: git tag -a v1.0.xxx -m 'releasing'
# git push --tags && git push
# Change the package.json version to the next build number in dist
# scripts/createDeployables
# upload the .pkg to S3
