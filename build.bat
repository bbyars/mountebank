@echo off

call npm install

set MB_PORT=3535
node node_modules\grunt-cli\bin\grunt %*
