setlocal
set port=8089
start /b python -m SimpleHTTPServer %port%
start "" "http://localhost:%port%/"
pause
