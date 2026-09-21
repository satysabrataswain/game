@echo off
setlocal
cd /d %~dp0
where python >nul 2>&1
if %errorlevel%==0 (
  set PY=python
) else (
  set PY=py
)
if not exist venv\Scripts\python.exe (
  echo Creating virtual environment...
  %PY% -m venv venv
)
call venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python manage.py migrate
start "" http://127.0.0.1:8000/
python manage.py runserver
