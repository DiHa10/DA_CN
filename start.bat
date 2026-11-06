@echo off
rem Khoi dong ca du an: PostgreSQL, Ollama, backend, frontend, moi cai mot cua so. Tat: dong tung cua so.
rem Dung duong dan theo noi dat file nay, nen clone repo o thu muc khac van chay.
set ROOT=%~dp0

start "PostgreSQL" "%ROOT%.pg\pgsql\bin\postgres.exe" -D "%ROOT%.pg\data" -p 5432

start "Ollama" cmd /k "set OLLAMA_MODELS=%ROOT%.ollama\models&& set OLLAMA_HOST=127.0.0.1:11434&& "%ROOT%.ollama\ollama.exe" serve"

rem cho PostgreSQL nhan ket noi truoc khi backend chay migration
timeout /t 4 /nobreak >nul

start "Backend" cmd /k "cd /d "%ROOT%backend" && set NLP_MODEL_DIR=%ROOT%ml\models\absa&& set DATABASE_URL=postgresql+psycopg://feedback:feedback@localhost:5432/feedback&& .venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"

start "Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

rem backend nap PhoBERT mat ~10 giay
echo Dang khoi dong, cho khoang 15 giay roi mo trinh duyet...
timeout /t 15 /nobreak >nul
start "" http://localhost:3000
