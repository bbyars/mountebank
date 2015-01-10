Releasing
=========

Travis.ci does most of the work, but not all.  I'd like to experiment with Snap CI to see if it
can satisfy the cross-platform pipeline requirements, and give a manual deploy.

# Make sure the previous build passes in https://travis-ci.org/bbyars/mountebank
# Make sure the Windows build passes with the latest
# Review major / minor version.  If an increment is needed:
  * change the FIRST_TRAVIS_BUILD_NUMBER_FOR_NEW_VERSION variable of the build script to reset the patch.
    * make it 2 more than the current Travis build to support the prep commit and the tag commit
  * update package.json
# Update the releases.json
# Change the views/releases/vx.x.x filename
# Make sure to use absolute URLs in views/releases so they work in aggregators, etc
# commit
# push
# wait for the build to pass
# tag: git tag -a vXX.YY.ZZ -m 'vXX.YY.ZZ release'
# git push --tags
# Change the package.json version to the next build number in dist
# scripts/createDistributables
# upload the .pkg AND the -darwin.tar.gz to S3
