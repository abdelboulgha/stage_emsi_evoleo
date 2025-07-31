# Guide d'Utilisation - Système d'Extraction de Factures

## 🚀 Installation et Configuration

### 1. Prérequis
- **Python 3.8+** installé
- **Visual FoxPro 9** installé
- **MySQL** installé et configuré

### 2. Configuration automatique
Exécutez le script de configuration :
```bash
config_foxpro.bat
```

Ce script vérifiera automatiquement :
- ✅ L'installation de FoxPro
- ✅ Les fichiers nécessaires
- ✅ La configuration du projet

## 📁 Structure du Projet

```
stage_emsi_2025/
├── main.py                    # API Python principale
├── formulaire_foxpro_final.prg # Formulaire FoxPro
├── factures.dbf              # Base de données FoxPro
├── lancer_foxpro.bat         # Lanceur automatique
├── config_foxpro.bat         # Script de configuration
├── front_end/                # Interface web React
└── README_UTILISATEUR.md     # Ce guide
```

## 🎯 Utilisation

### Méthode 1 : Interface Web (Recommandée)
1. **Lancer l'API :** `python main.py`
2. **Ouvrir l'interface :** http://localhost:3000
3. **Uploader une facture** (PDF ou image)
4. **Cliquer sur "Enregistrer dans FoxPro"** (bouton orange)
5. **Le formulaire FoxPro s'ouvre automatiquement** avec les données

### Méthode 2 : Lancement direct
1. **Double-cliquer sur** `lancer_foxpro.bat`
2. **Le formulaire FoxPro s'ouvre** avec les dernières données extraites

### Méthode 3 : Ouverture directe du fichier DBF
1. **Ouvrir FoxPro** directement
2. **File → Open → factures.dbf**
3. **Visualiser toutes les factures** enregistrées

## 🔧 Dépannage

### FoxPro ne se lance pas ?
- Vérifiez l'installation avec `config_foxpro.bat`
- Assurez-vous que FoxPro est dans le PATH ou dans un emplacement standard

### Le taux TVA affiche 0.00 ?
- Relancez l'API : `python main.py`
- Refaites une extraction de facture
- Supprimez les fichiers `.fxp` s'ils existent

### Erreur de base de données ?
- Vérifiez que MySQL est démarré
- Vérifiez les paramètres de connexion dans `main.py`

## 📊 Données Stockées

### Base MySQL (evoleo.Facture)
- `fournisseur` : Nom du fournisseur
- `numFacture` : Numéro de facture
- `tauxTVA` : Taux de TVA (%)
- `montantHT` : Montant hors taxes
- `montantTVA` : Montant de la TVA
- `montantTTC` : Montant toutes taxes comprises

### Fichier DBF (factures.dbf)
- `fournissr` : Fournisseur (30 caractères)
- `numfact` : Numéro facture (15 caractères)
- `tauxtva` : Taux TVA (5,2 décimales)
- `mntht` : Montant HT (10,2 décimales)
- `mnttva` : Montant TVA (10,2 décimales)
- `mntttc` : Montant TTC (10,2 décimales)

## 🆘 Support

En cas de problème :
1. Exécutez `config_foxpro.bat` pour diagnostiquer
2. Vérifiez les logs dans `invoice_debug.log`
3. Relancez l'API et refaites l'extraction 