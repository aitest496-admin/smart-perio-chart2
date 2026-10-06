@echo off
setlocal
cd /d "%~dp0"

echo Repository: https://github.com/aitest496-admin/smart-perio-chart2
echo Site: https://aitest496-admin.github.io/smart-perio-chart2/
echo.

git remote get-url origin >nul 2>&1
if errorlevel 1 goto error
set "DEPLOY_REMOTE="
for /f "delims=" %%R in ('git remote get-url origin') do set "DEPLOY_REMOTE=%%R"
if not "%DEPLOY_REMOTE%"=="https://github.com/aitest496-admin/smart-perio-chart2.git" (
    echo Unexpected origin. Deployment stopped.
    goto error
)
set "DEPLOY_BRANCH="
for /f "delims=" %%B in ('git branch --show-current') do set "DEPLOY_BRANCH=%%B"
if not "%DEPLOY_BRANCH%"=="main" (
    echo Switch to main before deploying.
    goto error
)

rem Avoid accidentally committing files staged by another task.
git diff --cached --quiet
if errorlevel 1 (
    echo There are already staged changes. Commit or unstage them before deploying.
    goto error
)

echo Checking types and building...
call npx tsc --noEmit
if errorlevel 1 goto error
call npm run build
if errorlevel 1 goto error

echo Staging app source and the active mock image...
git add -- App.tsx index.tsx index.html index.css vite.config.ts vite-env.d.ts package.json package-lock.json tsconfig.json tailwind.config.js types.ts components services utils .github deploy_github_pages.bat public/images/perio-history-mock-v3.png public/images/perio-history-mock-v3.prompt.txt
if errorlevel 1 goto error

git diff --cached --quiet
if errorlevel 1 (
    git commit -m "chore: deploy app updates"
    if errorlevel 1 goto error
) else (
    echo No new source changes. Sending existing commits.
)

echo Sending commits to origin/main and triggering GitHub Pages...
git push origin main
if errorlevel 1 goto error

echo.
echo Push completed. Wait for GitHub Actions to finish successfully:
echo https://github.com/aitest496-admin/smart-perio-chart2/actions
echo Then open https://aitest496-admin.github.io/smart-perio-chart2/
pause
exit /b 0

:error
echo.
echo Deployment stopped. Check the message above.
pause
exit /b 1
