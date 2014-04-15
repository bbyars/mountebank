Releasing
=========

Travis.ci does most of the work, but not all.  I'd like to experiment with Snap CI to see if it
can satisfy the cross-platform pipeline requirements, and give a manual deploy.

# Make sure the previous build passes in https://travis-ci.org/bbyars/mountebank
# Change the package.json version to the next build number
# commit
# tag: git tag -a v1.0.xxx -m 'releasing'
# git push --tags
# scripts/createDeployables
# upload the .pkg to S3
