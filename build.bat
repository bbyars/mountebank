@echo off

REM For node v0.12 and below, the jsdom installation included in npm install requires
REM python 2.7, and probably some other build tools, to install correctly on Windows
REM For node v4, jsdom requires no native dependencies

REM I want to test x86 and x64 zip files, but no need to retest default grunt task
REM on x86.  Appveyor doesn't give me an elegant way to explicitly define the matrix,
REM so we'll just shortcut those nodes in the matrix
reg Query "HKLM\Hardware\Description\System\CentralProcessor\0" | find /i "x86" > NUL && set ARCH=x86|| set ARCH=x64
if "%MB_SKIP_x86%"=="true" (
    if "%ARCH%"=="x86" (
        echo "Shortcutting build, MB_SKIP_x86=true"
        goto :eof
    )
)

call node scripts/fixDependencies
call npm install
set MB_PORT=3535
node node_modules\grunt-cli\bin\grunt %*

:eof
