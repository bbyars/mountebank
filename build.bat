@echo off

call npm ci

set MB_PORT=3535
node node_modules\grunt-cli\bin\grunt %*
