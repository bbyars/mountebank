Releasing
=========

Travis.ci does most of the work, but not all.  I'd like to experiment with Snap CI to see if it
can satisfy the cross-platform pipeline requirements, and give a manual deploy.

# Make sure the previous build passes in https://travis-ci.org/bbyars/mountebank
# Make sure the Windows build passes with the latest
# Review major / minor version.
# Update the releases.json
# Change the views/releases/vx.x.x filename
  * Update validatorTest
# Make sure to use absolute URLs in views/releases so they work in aggregators, etc
# commit
# push
# wait for the build to pass
# tag: git tag -a vXX.YY.ZZ -m 'vXX.YY.ZZ release'
# git push --tags
# scripts/createDistributables
  * Fix the random ruby versioning / rvm issues.  Last time I upgraded rvm and use ruby-2.1.0 to fix it
# upload the .pkg AND the -darwin.tar.gz to S3
