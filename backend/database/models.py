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
    mappings: Mapped[List["Mapping"]] = relationship("Mapping", back_populates="template", cascade="all, delete-orphan")
    
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
   
    created_by: Mapped[int] = Column(Integer, ForeignKey("utilisateurs.id"), nullable=False)
    
    # Relationships
    template: Mapped["Template"] = relationship("Template", back_populates="mappings")
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
    date_creation: Mapped[datetime] = Column(TIMESTAMP, nullable=False, default=datetime.utcnow) 
    created_by: Mapped[int] = Column(Integer, ForeignKey("utilisateurs.id"), nullable=False)
    
    # Relationships
    created_by_user: Mapped["User"] = relationship("User", back_populates="factures")
    
    def to_dict(self) -> dict:
        """Convert model to dictionary"""
        return {
            "id": self.id,
            "fournisseur": self.fournisseur,
            "numFacture": self.numFacture,
            "tauxTVA": float(self.tauxTVA) if self.tauxTVA else 0.0,
            "montantHT": float(self.montantHT) if self.montantHT else 0.0,
            "montantTVA": float(self.montantTVA) if self.montantTVA else 0.0,
            "montantTTC": float(self.montantTTC) if self.montantTTC else 0.0,
            "dateFacturation": self.dateFacturation.isoformat() if self.dateFacturation else None,
            "date_creation": self.date_creation.isoformat() if self.date_creation else None,
            "created_by": self.created_by
        }
