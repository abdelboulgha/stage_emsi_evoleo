# Migration vers SQLAlchemy ORM - Guide Complet

## 🎯 Objectif
Ce guide explique la migration de votre backend de requêtes SQL brutes vers SQLAlchemy ORM, une architecture moderne et maintenable.

## 🚀 Avantages de la Migration

### Avant (Requêtes SQL brutes)
- ❌ Code difficile à maintenir
- ❌ Risque d'injection SQL
- ❌ Pas de validation des types
- ❌ Gestion manuelle des connexions
- ❌ Code dupliqué

### Après (SQLAlchemy ORM)
- ✅ Code propre et maintenable
- ✅ Protection automatique contre l'injection SQL
- ✅ Validation automatique des types
- ✅ Gestion automatique des connexions
- ✅ Architecture en couches (Repository + Service)

## 📁 Nouvelle Structure du Code

```
backend/
├── database/                 # Couche base de données
│   ├── __init__.py
│   ├── config.py            # Configuration SQLAlchemy
│   ├── models.py            # Modèles ORM
│   ├── repositories.py      # Couche d'accès aux données
│   └── init_db.py          # Initialisation de la DB
├── services/                # Couche métier
│   ├── __init__.py
│   ├── template_service.py  # Service des templates
│   └── facture_service.py   # Service des factures
├── main_refactored.py       # Main refactorisé avec ORM
└── alembic.ini             # Configuration des migrations
```

## 🔧 Installation des Dépendances

```bash
pip install -r Requirements+Readme/requirements.txt
```

## 🗄️ Configuration de la Base de Données

### Variables d'environnement (.env)
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=evoleo
DB_PORT=3306
```

### Initialisation de la base
```bash
cd backend
python -m database.init_db
```

## 📊 Modèles ORM Créés

### 1. User (Utilisateur)
```python
class User(Base, TimestampMixin):
    __tablename__ = "utilisateurs"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    email: Mapped[str] = Column(String(255), unique=True, index=True)
    nom: Mapped[str] = Column(String(100))
    prenom: Mapped[str] = Column(String(100))
    mot_de_passe_hash: Mapped[str] = Column(String(255))
    role: Mapped[str] = Column(String(50), default="comptable")
```

### 2. Template
```python
class Template(Base, TimestampMixin):
    __tablename__ = "templates"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(255))
    created_by: Mapped[int] = Column(Integer, ForeignKey("utilisateurs.id"))
```

### 3. Mapping
```python
class Mapping(Base, TimestampMixin):
    __tablename__ = "mappings"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    template_id: Mapped[int] = Column(Integer, ForeignKey("templates.id"))
    field_id: Mapped[int] = Column(Integer, ForeignKey("field_name.id"))
    left: Mapped[float] = Column(Float)
    top: Mapped[float] = Column(Float)
    width: Mapped[float] = Column(Float)
    height: Mapped[float] = Column(Float)
    manual: Mapped[bool] = Column(Boolean, default=False)
```

### 4. Facture
```python
class Facture(Base, TimestampMixin):
    __tablename__ = "facture"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    fournisseur: Mapped[str] = Column(String(255))
    numFacture: Mapped[str] = Column(String(100))
    dateFacturation: Mapped[Optional[datetime]] = Column(DateTime)
    montantHT: Mapped[Optional[float]] = Column(Float)
    montantTTC: Mapped[Optional[float]] = Column(Float)
    tva: Mapped[Optional[float]] = Column(Float)
   
```

## 🔄 Migration des Fonctions

### Avant (SQL brut)
```python
async def save_mapping_db(template_name: str, field_map: Dict[str, Any], current_user_id: int = None) -> bool:
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        
        connection.start_transaction()
        
        # 1. Check if template exists
        cursor.execute("""
            SELECT id FROM templates 
            WHERE name = %s AND created_by = %s
            LIMIT 1
        """, (template_name, current_user_id))
        template = cursor.fetchone()
        
        # ... plus de code SQL brut
```

### Après (ORM)
```python
async def save_mapping(self, template_name: str, field_map: Dict[str, Any], current_user_id: int) -> bool:
    try:
        # 1. Check if template exists
        template = await self.template_repo.get_by_name_and_user(template_name, current_user_id)
        
        # 2. Create or get template
        if template:
            template_id = template.id
        else:
            template = await self.template_repo.create({
                "name": template_name,
                "created_by": current_user_id
            })
            template_id = template.id
        
        # 3. Delete existing mappings
        await self.mapping_repo.delete_by_template_id(template_id)
        
        # 4. Create new mappings
        mappings_data = []
        for field_name, coords in field_map.items():
            if coords is not None:
                field = await self.field_repo.get_by_name(field_name)
                if field:
                    mappings_data.append({
                        "template_id": template_id,
                        "field_id": field.id,
                        "left": coords.get('left', 0.0),
                        "top": coords.get('top', 0.0),
                        "width": coords.get('width', 0.0),
                        "height": coords.get('height', 0.0),
                        "manual": coords.get('manual', False),
                        "created_by": current_user_id
                    })
        
        if mappings_data:
            await self.mapping_repo.create_mappings(mappings_data)
        
        return True
        
    except Exception as e:
        await self.session.rollback()
        raise e
```

## 🚀 Utilisation du Nouveau Code

### 1. Démarrer l'application
```bash
cd backend
python main_refactored.py
```

### 2. Routes disponibles
- `POST /save-mapping` - Sauvegarder un mapping
- `GET /load-mapping/{template_id}` - Charger un mapping
- `DELETE /mappings/{template_id}` - Supprimer un mapping
- `POST /create-facture` - Créer une facture
- `GET /factures` - Lister les factures
- `PUT /factures/{facture_id}` - Modifier une facture
- `DELETE /factures/{facture_id}` - Supprimer une facture

### 3. Exemple d'utilisation
```python
# Créer un service
template_service = TemplateService(db_session)

# Sauvegarder un mapping
success = await template_service.save_mapping(
    template_name="mon_template",
    field_map=field_data,
    current_user_id=user_id
)

# Charger un mapping
mapping = await template_service.load_mapping(template_id)
```

## 🔒 Gestion des Sessions

### Dépendance FastAPI
```python
@app.post("/save-mapping")
async def save_mapping(
    request: SaveMappingRequest,
    current_user = Depends(require_comptable_or_admin),
    db = Depends(get_async_db)  # Session automatique
):
    template_service = TemplateService(db)
    # ... utilisation du service
```

### Gestion automatique
- ✅ Ouverture automatique des sessions
- ✅ Fermeture automatique des sessions
- ✅ Gestion des transactions
- ✅ Rollback automatique en cas d'erreur

## 📈 Performance

### Avantages
- **Connection Pooling** : Réutilisation des connexions
- **Lazy Loading** : Chargement à la demande
- **Query Optimization** : Optimisation automatique des requêtes
- **Batch Operations** : Opérations en lot

### Configuration du pool
```python
async_engine = create_async_engine(
    DATABASE_URL,
    pool_size=10,        # 10 connexions permanentes
    max_overflow=20,     # 20 connexions supplémentaires si nécessaire
    pool_pre_ping=True,  # Vérification de la validité des connexions
    pool_recycle=3600    # Recyclage des connexions toutes les heures
)
```

## 🛠️ Développement et Debug

### Mode debug SQL
```python
# Dans database/config.py
async_engine = create_async_engine(
    DATABASE_URL,
    echo=True,  # Affiche toutes les requêtes SQL
    # ... autres options
)
```

### Logs détaillés
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## 🔄 Migrations avec Alembic

### Initialisation
```bash
cd backend
alembic init alembic
```

### Créer une migration
```bash
alembic revision --autogenerate -m "Description des changements"
```

### Appliquer les migrations
```bash
alembic upgrade head
```

### Voir l'état
```bash
alembic current
alembic history
```

## 🧪 Tests

### Test des modèles
```python
import pytest
from database.models import User, Template
from database.config import get_async_db

@pytest.mark.asyncio
async def test_create_user():
    async for db in get_async_db():
        user = User(
            email="test@example.com",
            nom="Test",
            prenom="User",
            mot_de_passe_hash="hash123"
        )
        db.add(user)
        await db.commit()
        assert user.id is not None
```

## 🚨 Points d'Attention

### 1. Gestion des erreurs
- Toujours utiliser `try/catch` avec rollback
- Logger les erreurs pour le debug
- Retourner des messages d'erreur clairs

### 2. Transactions
- Utiliser `async with db.begin()` pour les transactions complexes
- Rollback automatique en cas d'erreur
- Commit explicite pour les opérations critiques

### 3. Performance
- Éviter le N+1 query problem
- Utiliser `selectinload()` pour les relations
- Paginer les résultats volumineux

## 📚 Ressources

- [Documentation SQLAlchemy](https://docs.sqlalchemy.org/)
- [FastAPI + SQLAlchemy](https://fastapi.tiangolo.com/tutorial/sql-databases/)
- [Alembic Migrations](https://alembic.sqlalchemy.org/)

## 🎉 Conclusion

Cette migration apporte :
- **Maintenabilité** : Code plus lisible et organisé
- **Sécurité** : Protection automatique contre les injections SQL
- **Performance** : Connection pooling et optimisation des requêtes
- **Évolutivité** : Architecture modulaire et extensible
- **Standards** : Respect des bonnes pratiques Python

Votre backend est maintenant prêt pour la production avec une architecture moderne et robuste ! 🚀
