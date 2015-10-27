Releasing
=========

Travis.ci does most of the heavy lifting.

# Make sure the previous build passes in https://travis-ci.org/bbyars/mountebank
# Make sure the Windows build passes with the latest
# Review major / minor version.
# Update the releases.json
# Change the views/releases/vx.x.x filename
# Make sure to use absolute URLs in views/releases so they work in aggregators, etc
# commit
# push
# wait for the build to pass
# tag: git tag -a vXX.YY.ZZ -m 'vXX.YY.ZZ release'
# git push --tags
# update version in package.json to avoid accidental version overwrite
