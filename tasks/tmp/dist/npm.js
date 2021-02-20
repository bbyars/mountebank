'use strict';


/*

if [ "$PUBLISH" = "true" ]; then
cd dist/mountebank
else
# Test npm publish to detect issues before the production publish
# I've been surprised by Travis-related errors before
cp -r dist/mountebank dist/mountebank-dev
cd dist/mountebank-dev
mv package.json package.json.orig
sed -E -e 's/"name": "mountebank"/"name": "mountebank-dev"/' package.json.orig > package.json
fi

dpl --provider=npm --email=brandon.byars@gmail.com --api-key=$NPM_API_KEY --skip-cleanup
cd ../..
*/
