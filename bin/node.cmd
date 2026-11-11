@echo off
set ELECTRON_RUN_AS_NODE=1
set NODE_NO_WARNINGS=1
set NODE_PATH=%~dp0..\node_modules;C:\Users\admin\AppData\Local\Programs\Antigravity IDE\resources\app\node_modules
"C:\Users\admin\AppData\Local\Programs\Microsoft VS Code\Code.exe" --experimental-strip-types %*

