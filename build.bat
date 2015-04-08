@echo off

REM The jsdom installation included in npm install requires python 2.7,
REM and probably some other build tools, to install correctly on Windows

call npm install
call npm install grunt-cli
set MB_PORT=3535
node node_modules\grunt-cli\bin\grunt %*
