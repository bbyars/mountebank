@echo off

REM For node v0.12 and below, the jsdom installation included in npm install requires
REM python 2.7, and probably some other build tools, to install correctly on Windows
REM For node v4, jsdom requires no native dependencies

call node scripts/fixDependencies
call npm install
set MB_PORT=3535
node node_modules\grunt-cli\bin\grunt %*
