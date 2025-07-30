@echo off
echo ========================================
echo LANCEMENT FOXPRO POUR FACTURES EXTRACTES
echo ========================================
echo.

REM Détecter automatiquement le répertoire courant
set CURRENT_DIR=%CD%
echo Repertoire courant: %CURRENT_DIR%

REM Chercher FoxPro dans les emplacements courants
set FOXPRO_FOUND=0

REM Essayer les emplacements courants
if exist "C:\Program Files (x86)\Microsoft Visual FoxPro 9\vfp9.exe" (
    set FOXPRO_PATH="C:\Program Files (x86)\Microsoft Visual FoxPro 9\vfp9.exe"
    set FOXPRO_FOUND=1
    goto :found
)

if exist "C:\Program Files\Microsoft Visual FoxPro 9\vfp9.exe" (
    set FOXPRO_PATH="C:\Program Files\Microsoft Visual FoxPro 9\vfp9.exe"
    set FOXPRO_FOUND=1
    goto :found
)

REM Chercher dans le répertoire courant et ses sous-dossiers
for /r "%CURRENT_DIR%" %%i in (vfp9.exe) do (
    if exist "%%i" (
        set FOXPRO_PATH="%%i"
        set FOXPRO_FOUND=1
        goto :found
    )
)

REM Chercher dans le PATH système
where vfp9.exe >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('where vfp9.exe') do (
        set FOXPRO_PATH="%%i"
        set FOXPRO_FOUND=1
        goto :found
    )
)

:not_found
echo ERREUR: FoxPro 9 non trouve!
echo.
echo Veuillez installer Visual FoxPro 9 ou specifier le chemin manuellement.
echo.
echo Emplacements recherches:
echo - C:\Program Files (x86)\Microsoft Visual FoxPro 9\
echo - C:\Program Files\Microsoft Visual FoxPro 9\
echo - Repertoire courant et sous-dossiers
echo - PATH system
echo.
pause
exit /b 1

:found
echo FoxPro trouve: %FOXPRO_PATH%
echo.

REM Vérifier que le fichier PRG existe
if not exist "formulaire_foxpro_final.prg" (
    echo ERREUR: Le fichier formulaire_foxpro_final.prg n'existe pas!
    echo.
    echo Veuillez vous assurer que le fichier est present dans le repertoire:
    echo %CURRENT_DIR%
    echo.
    pause
    exit /b 1
)

echo Lancement de Visual FoxPro 9...
echo.

%FOXPRO_PATH% formulaire_foxpro_final.prg

echo.
echo FoxPro ferme.
pause 