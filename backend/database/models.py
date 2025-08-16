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
    
    # Relationships
    templates: Mapped[List["Template"]] = relationship("Template", back_populates="created_by_user")
    mappings: Mapped[List["Mapping"]] = relationship("Mapping", back_populates="created_by_user")
    factures: Mapped[List["Facture"]] = relationship("Facture", back_populates="created_by_user")
    subscriptions: Mapped[List["Subscription"]] = relationship("Subscription", back_populates="user")
    cards: Mapped[List["UserCard"]] = relationship("UserCard", back_populates="user")


class FieldName(Base):
    """Field names for document extraction"""
    __tablename__ = "field_name"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(100), unique=True, nullable=False)
    
    # Relationships
    mappings: Mapped[List["Mapping"]] = relationship("Mapping", back_populates="field")


class Template(Base):
    """Document templates"""
    __tablename__ = "templates"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(255), nullable=False)
    created_by: Mapped[int] = Column(Integer, ForeignKey("utilisateurs.id"), nullable=False)
    
    # Relationships
    created_by_user: Mapped["User"] = relationship("User", back_populates="templates")
    mappings: Mapped[List["Mapping"]] = relationship("Mapping", back_populates="template", cascade="all, delete-orphan")


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
    template: Mapped["Template"] = relationship("Template", back_populates="mappings")
    field: Mapped["FieldName"] = relationship("FieldName", back_populates="mappings")
    created_by_user: Mapped["User"] = relationship("User", back_populates="mappings")


class Facture(Base):
    """Invoice model"""
    __tablename__ = "facture"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    fournisseur: Mapped[str] = Column(String(255), nullable=False)
    numFacture: Mapped[str] = Column(String(100), nullable=False)
    tauxTVA: Mapped[float] = Column(DECIMAL(15,2), nullable=False)  # Changed from tva to tauxTVA
    montantHT: Mapped[float] = Column(DECIMAL(15,2), nullable=False)  # Changed from Optional[float]
    montantTVA: Mapped[float] = Column(DECIMAL(15,2), nullable=False)  # Added montantTVA
    montantTTC: Mapped[float] = Column(DECIMAL(15,2), nullable=False)  # Changed from Optional[float]
    dateFacturation: Mapped[datetime] = Column(Date, nullable=False)  # Changed from Optional[datetime] and DateTime to Date
    date_creation: Mapped[datetime] = Column(TIMESTAMP, nullable=False, default=datetime.utcnow)  # Added date_creation
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
            "montantTTC": float(self.montantTVA) if self.montantTTC else 0.0,
            "dateFacturation": self.dateFacturation.isoformat() if self.dateFacturation else None,
            "date_creation": self.date_creation.isoformat() if self.date_creation else None,
            "created_by": self.created_by
        }


class Subscription(Base):
    """Subscription model for user plans"""
    __tablename__ = "subscriptions"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = Column(Integer, ForeignKey("utilisateurs.id"), nullable=False)
    plan_type: Mapped[str] = Column(String(50), nullable=False)  # "trial", "monthly", "semester", "yearly"
    amount: Mapped[float] = Column(DECIMAL(10,2), nullable=False)
    start_date: Mapped[datetime] = Column(DateTime, nullable=False, default=datetime.utcnow)
    end_date: Mapped[datetime] = Column(DateTime, nullable=False)
    is_active: Mapped[bool] = Column(Boolean, default=True, nullable=False)
    stripe_subscription_id: Mapped[Optional[str]] = Column(String(255), nullable=True)
    
    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="subscriptions")
    payments: Mapped[List["Payment"]] = relationship("Payment", back_populates="subscription")


class Payment(Base):
    """Payment model for tracking transactions"""
    __tablename__ = "payments"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    subscription_id: Mapped[int] = Column(Integer, ForeignKey("subscriptions.id"), nullable=False)
    amount: Mapped[float] = Column(DECIMAL(10,2), nullable=False)
    currency: Mapped[str] = Column(String(3), default="MAD", nullable=False)
    stripe_payment_intent_id: Mapped[str] = Column(String(255), nullable=False)
    status: Mapped[str] = Column(String(50), default="pending", nullable=False)  # pending, succeeded, failed
    payment_method: Mapped[str] = Column(String(50), nullable=False)  # card, etc.
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    subscription: Mapped["Subscription"] = relationship("Subscription", back_populates="payments")


class UserCard(Base):
    """User's saved card information"""
    __tablename__ = "user_cards"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = Column(Integer, ForeignKey("utilisateurs.id"), nullable=False)
    stripe_payment_method_id: Mapped[str] = Column(String(255), nullable=False)
    card_brand: Mapped[str] = Column(String(50), nullable=False)
    last4: Mapped[str] = Column(String(4), nullable=False)
    expiry_month: Mapped[int] = Column(Integer, nullable=False)
    expiry_year: Mapped[int] = Column(Integer, nullable=False)
    is_default: Mapped[bool] = Column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="cards")
