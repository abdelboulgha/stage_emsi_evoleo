* ========================================
* FORMULAIRE FOXPRO FINAL POUR FACTURES EXTRACTES
* ========================================

SET TALK OFF
SET SAFETY OFF
SET EXACT ON
SET CENTURY ON
SET DATE TO FRENCH

* Variables pour les champs
PRIVATE m_fournissr, m_numfact, m_datefacturation, m_tauxtva, m_mntht, m_mnttva, m_mntttc
PRIVATE ocr_file, json_content
PRIVATE fournissr_size, numfact_size, fournissr_display, numfact_display

* Initialisation avec des tailles de base
m_fournissr = SPACE(100)  && Taille maximale pour recevoir les données
m_numfact = SPACE(50)     && Taille maximale pour recevoir les données
m_datefacturation = DATE()  && Initialiser avec la date courante
m_tauxtva = 0.00
m_mntht = 0.00
m_mnttva = 0.00
m_mntttc = 0.00

* Ouvrir la table
USE factures.dbf SHARED

* Vérifier si le fichier OCR existe
ocr_file = "ocr_extraction.json"
IF !FILE(ocr_file)
    ? "Fichier d'extraction OCR non trouvé: " + ocr_file
    ? "Veuillez d'abord extraire une facture via l'interface web"
    WAIT "Appuyez sur une touche..." WINDOW
    USE
    RETURN
ENDIF

* Lire le fichier JSON directement
json_content = FILETOSTR(ocr_file)

* Extraire les données avec une méthode plus robuste - LIRE DANS LA SECTION "fields"
m_fournissr = PADR(ALLTRIM(ExtractJSONValueFromSection(json_content, "fields", "fournisseur")), 100)
m_numfact = PADR(ALLTRIM(ExtractJSONValueFromSection(json_content, "fields", "numeroFacture")), 50)

* Extraire la date de facturation et la convertir au format français
PRIVATE date_iso, date_fr, date_clean
date_iso = ExtractJSONValueFromSection(json_content, "fields", "dateFacturation")

* Nettoyer la date en extrayant seulement la partie date
IF !EMPTY(date_iso)
    * Chercher le pattern DD/MM/YYYY dans la chaîne
    PRIVATE pos_slash1, pos_slash2, day_part, month_part, year_part
    
    * Chercher le premier "/"
    pos_slash1 = AT("/", date_iso)
    IF pos_slash1 > 0
        * Chercher le deuxième "/"
        pos_slash2 = AT("/", date_iso, 2)
        IF pos_slash2 > 0 AND pos_slash2 > pos_slash1
            * Extraire les parties de la date
            day_part = ALLTRIM(SUBSTR(date_iso, pos_slash1 - 2, 2))
            month_part = ALLTRIM(SUBSTR(date_iso, pos_slash1 + 1, 2))
            year_part = ALLTRIM(SUBSTR(date_iso, pos_slash2 + 1, 4))
            
            * Vérifier que les parties sont valides
            IF ISDIGIT(day_part) AND ISDIGIT(month_part) AND ISDIGIT(year_part)
                date_fr = day_part + "/" + month_part + "/" + year_part
                m_datefacturation = CTOD(date_fr)
            ELSE
                m_datefacturation = DATE()  && Date courante si format invalide
            ENDIF
        ELSE
            m_datefacturation = DATE()  && Date courante si format invalide
        ENDIF
    ELSE
        * Essayer le format YYYY-MM-DD
        IF LEN(date_iso) >= 10 AND AT("-", date_iso) > 0
            date_fr = SUBSTR(date_iso, 9, 2) + "/" + SUBSTR(date_iso, 6, 2) + "/" + SUBSTR(date_iso, 1, 4)
            m_datefacturation = CTOD(date_fr)
        ELSE
            m_datefacturation = DATE()  && Date courante si pas de date valide
        ENDIF
    ENDIF
ELSE
    m_datefacturation = DATE()  && Date courante si pas de date valide
ENDIF

* Convertir les nombres avec gestion des virgules - LIRE DANS LA SECTION "fields"
m_tauxtva = VAL(STRTRAN(ExtractJSONValueFromSection(json_content, "fields", "tauxTVA"), ",", "."))
m_mntht = VAL(STRTRAN(ExtractJSONValueFromSection(json_content, "fields", "montantHT"), ",", "."))
m_mnttva = VAL(STRTRAN(ExtractJSONValueFromSection(json_content, "fields", "montantTVA"), ",", "."))
m_mntttc = VAL(STRTRAN(ExtractJSONValueFromSection(json_content, "fields", "montantTTC"), ",", "."))

* Calculer automatiquement les tailles d'affichage optimales
fournissr_size = CalculateDisplaySize(ALLTRIM(m_fournissr), 15, 60)  && Min 15, Max 60
numfact_size = CalculateDisplaySize(ALLTRIM(m_numfact), 15, 35)      && Min 15, Max 35

* Ajuster les variables à la taille d'affichage calculée
m_fournissr = PADR(ALLTRIM(m_fournissr), fournissr_size)
m_numfact = PADR(ALLTRIM(m_numfact), numfact_size)

* Créer les chaînes PICTURE dynamiquement
fournissr_display = "@S" + STR(fournissr_size, 2, 0)
numfact_display = "@S" + STR(numfact_size, 2, 0)

* Afficher le formulaire avec les données pré-remplies
CLEAR
@ 2, 5 SAY "=========================================="
@ 3, 5 SAY "*****FACTURE EXTRACTE ****"
@ 4, 5 SAY "=========================================="
@ 14, 5 SAY "Fournisseur:"
@ 14, 20 GET m_fournissr PICTURE (fournissr_display)

@ 16, 5 SAY "N° Facture:"
@ 16, 20 GET m_numfact PICTURE (numfact_display)

@ 18, 5 SAY "Date Facturation:"
@ 18, 20 GET m_datefacturation

@ 20, 5 SAY "Taux TVA (%):"
@ 20, 20 GET m_tauxtva PICTURE "999999.99"

@ 22, 5 SAY "Montant HT:"
@ 22, 20 GET m_mntht PICTURE "999999.99"

@ 24, 5 SAY "Montant TVA:"
@ 24, 20 GET m_mnttva PICTURE "999999.99"

@ 26, 5 SAY "Montant TTC:"
@ 26, 20 GET m_mntttc PICTURE "999999.99"

@ 28, 5 SAY "=========================================="
@ 29, 5 SAY "Appuyez sur ENTER pour sauvegarder, ESC pour annuler"

READ

* Vérifier que la table est bien positionnée et ouverte
IF !USED("factures")
    ? "Erreur: La table factures n'est pas disponible"
    WAIT "Appuyez sur une touche..." WINDOW
    RETURN
ENDIF

* Sauvegarder si l'utilisateur n'a pas appuyé sur ESC
IF LASTKEY() # 27
    APPEND BLANK
    IF !EOF()  && Vérifier que l'enregistrement a été ajouté
        REPLACE fournissr WITH ALLTRIM(m_fournissr), ;
                numfact WITH ALLTRIM(m_numfact), ;
                datefact WITH m_datefacturation, ;
                tauxtva WITH m_tauxtva, ;
                mntht WITH m_mntht, ;
                mnttva WITH m_mnttva, ;
                mntttc WITH m_mntttc

        ? "Facture enregistrée avec succès dans la base de données"
        ? "Fournisseur: " + ALLTRIM(m_fournissr)
        ? "N° Facture: " + ALLTRIM(m_numfact)
        ? "Date Facturation: " + DTOC(m_datefacturation)
        ? "Montant TTC: " + STR(m_mntttc, 10, 2)
    ELSE
        ? "Erreur lors de l'ajout de l'enregistrement"
    ENDIF
    WAIT "Appuyez sur une touche pour continuer..." WINDOW
ELSE
    ? "Sauvegarde annulée"
    WAIT "Appuyez sur une touche pour continuer..." WINDOW
ENDIF

USE
RETURN

* ========================================
* FONCTION POUR CALCULER LA TAILLE D'AFFICHAGE OPTIMALE
* ========================================

FUNCTION CalculateDisplaySize
PARAMETERS content_value, min_size, max_size

PRIVATE content_length, optimal_size, screen_available

* Longueur du contenu réel
content_length = LEN(ALLTRIM(content_value))

* Espace disponible à l'écran (80 colonnes - position de départ - marge)
screen_available = 80 - 18 - 5  && 57 caractères maximum

* Calculer la taille optimale
optimal_size = content_length + 5  && Ajouter 5 caractères de marge

* Appliquer les contraintes minimum et maximum
optimal_size = MAX(optimal_size, min_size)
optimal_size = MIN(optimal_size, max_size)
optimal_size = MIN(optimal_size, screen_available)

RETURN optimal_size

* ========================================
* FONCTION AMELIOREE POUR EXTRAIRE LES VALEURS JSON
* ========================================

FUNCTION ExtractJSONValue
PARAMETERS json_str, field_name

PRIVATE start_pos, end_pos, value, search_pattern, temp_str

* Vérifier les paramètres
IF EMPTY(json_str) OR EMPTY(field_name)
    RETURN ""
ENDIF

* Chercher le champ avec guillemets
search_pattern = '"' + ALLTRIM(field_name) + '":'
start_pos = AT(search_pattern, json_str)

IF start_pos = 0
    RETURN ""
ENDIF

* Positionner après les deux points
start_pos = start_pos + LEN(search_pattern)
temp_str = LTRIM(SUBSTR(json_str, start_pos))

* Déterminer si c'est une chaîne (commence par ") ou un nombre
IF LEFT(temp_str, 1) = '"'
    * C'est une chaîne - chercher la guillemet de fermeture
    temp_str = SUBSTR(temp_str, 2)  && Enlever la première guillemet
    end_pos = AT('"', temp_str)
    IF end_pos > 0
        value = SUBSTR(temp_str, 1, end_pos - 1)
    ELSE
        value = temp_str
    ENDIF
ELSE
    * C'est un nombre - chercher la virgule ou accolade suivante
    end_pos = AT(',', temp_str)
    IF end_pos = 0
        end_pos = AT('}', temp_str)
    ENDIF
    IF end_pos = 0
        end_pos = AT(CHR(13), temp_str)  && Retour chariot
    ENDIF
    IF end_pos = 0
        end_pos = AT(CHR(10), temp_str)  && Saut de ligne
    ENDIF
    
    IF end_pos > 0
        value = ALLTRIM(SUBSTR(temp_str, 1, end_pos - 1))
    ELSE
        value = ALLTRIM(temp_str)
    ENDIF
ENDIF

RETURN ALLTRIM(value)

* ========================================
* FONCTION POUR EXTRAIRE LES VALEURS D'UNE SECTION SPECIFIQUE DU JSON
* ========================================

FUNCTION ExtractJSONValueFromSection
PARAMETERS json_str, section_name, field_name

PRIVATE section_start, section_end, section_content, value

* Vérifier les paramètres
IF EMPTY(json_str) OR EMPTY(section_name) OR EMPTY(field_name)
    RETURN ""
ENDIF

* Chercher le début de la section
section_start = AT('"' + ALLTRIM(section_name) + '":', json_str)
IF section_start = 0
    RETURN ""
ENDIF

* Chercher la fin de la section (accolade fermante correspondante)
section_start = section_start + LEN('"' + ALLTRIM(section_name) + '":')
section_content = SUBSTR(json_str, section_start)

* Chercher l'accolade fermante de la section
PRIVATE brace_count, pos, char
brace_count = 0
pos = 1

DO WHILE pos <= LEN(section_content)
    char = SUBSTR(section_content, pos, 1)
    IF char = "{"
        brace_count = brace_count + 1
    ELSE
        IF char = "}"
            brace_count = brace_count - 1
            IF brace_count < 0
                section_end = pos - 1
                EXIT
            ENDIF
        ENDIF
    ENDIF
    pos = pos + 1
ENDDO

IF brace_count >= 0
    section_end = LEN(section_content)
ENDIF

* Extraire le contenu de la section
section_content = SUBSTR(section_content, 1, section_end)

* Chercher le champ dans cette section
value = ExtractJSONValue(section_content, field_name)

RETURN value