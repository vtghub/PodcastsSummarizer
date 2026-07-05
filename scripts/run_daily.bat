@echo off
setlocal

set ROOT=%~dp0..
set PYTHON=%ROOT%\.venv\Scripts\python.exe
set SCRIPT=%ROOT%\scripts\run_pipeline.py
set PYTHONUTF8=1

:: Start Ollama if not running
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I "ollama.exe" >NUL
if errorlevel 1 (
    start /B ollama serve
    timeout /T 5 /NOBREAK >NUL
)

:: Run the pipeline (Python handles its own logging)
"%PYTHON%" "%SCRIPT%"
endlocal
