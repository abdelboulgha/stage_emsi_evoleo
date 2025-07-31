@echo off
echo ========================================
echo CONFIGURATION FOXPRO POUR L'UTILISATEUR
echo ========================================
echo.

echo Ce script vous aide a configurer FoxPro pour ce projet.
echo.

REM Vérifier si FoxPro est installé
set FOXPRO_FOUND=0

echo Recherche de Visual FoxPro 9...
echo.

REM Essayer les emplacements courants
if exist "C:\Program Files (x86)\Microsoft Visual FoxPro 9\vfp9.exe" (
    echo [OK] FoxPro trouve dans: C:\Program Files ^(x86^)\Microsoft Visual FoxPro 9\
    set FOXPRO_FOUND=1
)

if exist "C:\Program Files\Microsoft Visual FoxPro 9\vfp9.exe" (
    echo [OK] FoxPro trouve dans: C:\Program Files\Microsoft Visual FoxPro 9\
    set FOXPRO_FOUND=1
)

REM Chercher dans le PATH
where vfp9.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] FoxPro trouve dans le PATH system
    for /f "tokens=*" %%i in ('where vfp9.exe') do (
        echo     Chemin: %%i
    )
    set FOXPRO_FOUND=1
)

if %FOXPRO_FOUND% equ 0 (
    echo [ERREUR] Visual FoxPro 9 non trouve!
    echo.
    echo Pour installer FoxPro:
    echo 1. Telechargez Visual FoxPro 9 depuis le site officiel Microsoft
    echo 2. Installez-le dans un des emplacements suivants:
    echo    - C:\Program Files ^(x86^)\Microsoft Visual FoxPro 9\
    echo    - C:\Program Files\Microsoft Visual FoxPro 9\
    echo 3. Ou ajoutez-le au PATH system
    echo.
    pause
    exit /b 1
)

echo.
echo [SUCCES] FoxPro est correctement configure!
echo.
echo Vous pouvez maintenant utiliser:
echo - lancer_foxpro.bat pour ouvrir le formulaire
echo - L'interface web pour extraire des factures
echo.

REM Vérifier les fichiers nécessaires
echo Verification des fichiers du projet...
if exist "formulaire_foxpro_final.prg" (
    echo [OK] Formulaire FoxPro present
) else (
    echo [ERREUR] formulaire_foxpro_final.prg manquant
)

if exist "factures.dbf" (
    echo [OK] Base de donnees factures.dbf presente
) else (
    echo [ERREUR] factures.dbf manquant
)

if exist "main.py" (
    echo [OK] API Python presente
) else (
    echo [ERREUR] main.py manquant
)

echo.
echo Configuration terminee!
pause 