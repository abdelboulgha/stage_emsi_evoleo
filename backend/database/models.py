"""
SQLAlchemy ORM models for the application
"""
from datetime import datetime
from typing import Optional, List
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, DECIMAL, Date, TIMESTAMP
from sqlalchemy.orm import relationship, Mapped
from sqlalchemy.ext.declarative import declared_attr
from database.config import Base


class TimestampMixin:
    """Mixin to add timestamp fields to models"""
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class User(Base):
    """User model for authentication and authorization"""
    __tablename__ = "utilisateurs"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    email: Mapped[str] = Column(String(255), unique=True, index=True, nullable=False)
    nom: Mapped[str] = Column(String(100), nullable=False)
    prenom: Mapped[str] = Column(String(100), nullable=False)
    mot_de_passe_hash: Mapped[str] = Column(String(255), nullable=False)
    role: Mapped[str] = Column(String(50), default="comptable", nullable=False)
    date_creation: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    actif: Mapped[bool] = Column(Boolean, default=True, nullable=False)
    
    # Relationships
    templates: Mapped[List["Template"]] = relationship("Template", back_populates="created_by_user")
    mappings: Mapped[List["Mapping"]] = relationship("Mapping", back_populates="created_by_user")
    factures: Mapped[List["Facture"]] = relationship("Facture", back_populates="created_by_user")


class FieldName(Base):
    """Field names for document extraction"""
    __tablename__ = "field_name"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(100), unique=True, nullable=False)
    
    # Relationships
    mappings: Mapped[List["Mapping"]] = relationship("Mapping", back_populates="field")


class Template(Base, TimestampMixin):
    """Document templates"""
    __tablename__ = "templates"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(255), nullable=False)
    serial: Mapped[str] = Column(String(9), unique=True, nullable=True)
    created_by: Mapped[int] = Column(Integer, ForeignKey("utilisateurs.id"), nullable=False)
    
    # Relationships
    created_by_user: Mapped["User"] = relationship("User", back_populates="templates")
    mappings: Mapped[List["Mapping"]] = relationship("Mapping", back_populates="template", cascade="all, delete-orphan", passive_deletes=True)
    
    __table_args__ = (
        {'extend_existing': True},
    )


class Mapping(Base):
    """Field mappings for templates"""
    __tablename__ = "mappings"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    template_id: Mapped[int] = Column(Integer, ForeignKey("templates.id"), nullable=False)
    field_id: Mapped[int] = Column(Integer, ForeignKey("field_name.id"), nullable=False)
    left: Mapped[float] = Column(Float, nullable=False)
    top: Mapped[float] = Column(Float, nullable=False)
    width: Mapped[float] = Column(Float, nullable=False)
    height: Mapped[float] = Column(Float, nullable=False)
    manual: Mapped[bool] = Column(Boolean, default=False, nullable=False)
    created_by: Mapped[int] = Column(Integer, ForeignKey("utilisateurs.id"), nullable=False)
    
    # Relationships
    template: Mapped["Template"] = relationship(
        "Template", 
        back_populates="mappings",
        passive_deletes=True
    )
    field: Mapped["FieldName"] = relationship("FieldName", back_populates="mappings")
    created_by_user: Mapped["User"] = relationship("User", back_populates="mappings")


class Facture(Base):
    """Invoice model"""
    __tablename__ = "facture"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    fournisseur: Mapped[str] = Column(String(255), nullable=False)
    numFacture: Mapped[str] = Column(String(100), nullable=False)
    tauxTVA: Mapped[float] = Column(DECIMAL(15,2), nullable=False)  
    montantHT: Mapped[float] = Column(DECIMAL(15,2), nullable=False)  
    montantTVA: Mapped[float] = Column(DECIMAL(15,2), nullable=False) 
    montantTTC: Mapped[float] = Column(DECIMAL(15,2), nullable=False) 
    dateFacturation: Mapped[datetime] = Column(Date, nullable=False)
    created_by: Mapped[int] = Column(Integer, ForeignKey("utilisateurs.id"), nullable=False)
    
    # Relationships
    created_by_user: Mapped["User"] = relationship("User", back_populates="factures")
    sous_valeurs: Mapped[List["SousValeurs"]] = relationship(
        "SousValeurs", 
        back_populates="facture", 
        cascade="all, delete-orphan",
        passive_deletes=True
    )
    
    def to_dict(self, include_sous_valeurs: bool = False) -> dict:
        """
        Convert model to dictionary
        
        """
        result = {
            "id": self.id,
            "fournisseur": self.fournisseur,
            "numFacture": self.numFacture,
            "tauxTVA": float(self.tauxTVA) if self.tauxTVA is not None else 0.0,
            "montantHT": float(self.montantHT) if self.montantHT is not None else 0.0,
            "montantTVA": float(self.montantTVA) if self.montantTVA is not None else 0.0,
            "montantTTC": float(self.montantTTC) if self.montantTTC is not None else 0.0,
            "dateFacturation": self.dateFacturation.isoformat() if self.dateFacturation else None,
            "created_by": self.created_by,
        }
        
        # Only include sous_valeurs if explicitly requested and they are loaded
        if include_sous_valeurs:
            try:
                result["sous_valeurs"] = [
                    {
                        "id": sv.id,
                        "HT": float(sv.HT) if sv.HT is not None else 0.0,
                        "TVA": float(sv.TVA) if sv.TVA is not None else 0.0,
                        "TTC": float(sv.TTC) if sv.TTC is not None else 0.0,
                        "facture_id": sv.facture_id,
                      
                    }
                    for sv in (self.sous_valeurs or [])
                ]
            except Exception as e:
                print(f"Error serializing sous_valeurs: {e}")
                result["sous_valeurs"] = []
        
        return result


class SousValeurs(Base):
    """Sous valeurs for invoice calculations"""
    __tablename__ = "sous_valeurs"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True, autoincrement=True)
    HT: Mapped[float] = Column(DECIMAL(15, 2), nullable=False)
    TVA: Mapped[float] = Column(DECIMAL(15, 2), nullable=False)
    TTC: Mapped[float] = Column(DECIMAL(15, 2), nullable=False)
    facture_id: Mapped[int] = Column(Integer, ForeignKey("facture.id"), nullable=False)
 
    
    # Relationships
    facture: Mapped["Facture"] = relationship(
        "Facture", 
        back_populates="sous_valeurs",
        passive_deletes=True
    )
