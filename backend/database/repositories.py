"""
Repository pattern for database operations
"""
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, update, and_, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.sql.expression import desc
from sqlalchemy import String
from database.models import User, Template, Mapping, FieldName, Facture


class BaseRepository:
    """Base repository with common operations"""
    
    def __init__(self, session: AsyncSession):
        self.session = session


class UserRepository(BaseRepository):
    """Repository for user operations"""
    
    async def get_by_email(self, email: str) -> Optional[User]:
        """Get user by email"""
        result = await self.session.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()
    
    async def get_by_id(self, user_id: int) -> Optional[User]:
        """Get user by ID"""
        result = await self.session.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()
    
    async def create(self, user_data: dict) -> User:
        """Create a new user"""
        user = User(**user_data)
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user


class TemplateRepository(BaseRepository):
    """Repository for template operations"""
    
    async def get_by_name_and_user(self, name: str, user_id: int) -> Optional[Template]:
        """Get template by name and user ID"""
        result = await self.session.execute(
            select(Template).where(
                and_(Template.name == name, Template.created_by == user_id)
            )
        )
        return result.scalar_one_or_none()
    
    async def get_by_user_id(self, user_id: int) -> List[Template]:
        """Get all templates for a user"""
        result = await self.session.execute(
            select(Template).where(Template.created_by == user_id)
        )
        return result.scalars().all()
    
    async def create(self, template_data: dict) -> Template:
        """Create a new template"""
        template = Template(**template_data)
        self.session.add(template)
        await self.session.commit()
        await self.session.refresh(template)
        return template
    
    async def delete_template_and_mappings(self, template_id: int) -> bool:
        """Delete template and all its mappings"""
        try:
            # Delete mappings first (cascade will handle this)
            await self.session.execute(
                delete(Mapping).where(Mapping.template_id == template_id)
            )
            
            # Delete template
            await self.session.execute(
                delete(Template).where(Template.id == template_id)
            )
            
            await self.session.commit()
            return True
        except Exception:
            await self.session.rollback()
            return False


class MappingRepository(BaseRepository):
    async def get_by_template_id(self, template_id: int) -> list[tuple[Mapping, str]]:
        """Get all mappings for a template with field names"""
        result = await self.session.execute(
            select(Mapping, FieldName.name)
            .join(FieldName, Mapping.field_id == FieldName.id)
            .where(Mapping.template_id == template_id)
        )
        rows = result.all()
        return [(row.Mapping, row.name) for row in rows]

    async def delete_by_template_id(self, template_id: int) -> int:
        """Delete all mappings for a template"""
        result = await self.session.execute(
            delete(Mapping).where(Mapping.template_id == template_id)
        )
        await self.session.commit()
        return result.rowcount
    
    async def create_mappings(self, mappings_data: List[dict]) -> List[Mapping]:
        """Create multiple mappings"""
        mappings = [Mapping(**data) for data in mappings_data]
        self.session.add_all(mappings)
        await self.session.commit()
        for mapping in mappings:
            await self.session.refresh(mapping)
        return mappings


class FieldNameRepository(BaseRepository):
    """Repository for field name operations"""
    
    async def get_by_name(self, name: str) -> Optional[FieldName]:
        """Get field by name"""
        result = await self.session.execute(
            select(FieldName).where(FieldName.name == name)
        )
        return result.scalar_one_or_none()
    
    async def get_all(self) -> List[FieldName]:
        """Get all field names"""
        result = await self.session.execute(select(FieldName))
        return result.scalars().all()


class FactureRepository(BaseRepository):
    """Repository for invoice operations"""
    
    async def create(self, facture_data: dict) -> Facture:
        """Create a new invoice"""

        
        facture = Facture(**facture_data)
  
        
        self.session.add(facture)

        
        await self.session.commit()

        
        await self.session.refresh(facture)
   
        
        return facture
    
    async def get_by_id(self, facture_id: int) -> Optional[Facture]:
        """Get invoice by ID"""
        result = await self.session.execute(
            select(Facture).where(Facture.id == facture_id)
        )
        return result.scalar_one_or_none()
    
    async def get_by_user(self, user_id: int, skip: int = 0, limit: int = 100) -> List[Facture]:
        """Get invoices by user with pagination"""
        result = await self.session.execute(
            select(Facture)
            .where(Facture.created_by == user_id)
            .offset(skip)
            .limit(limit)
            .order_by(Facture.id.desc())  # Use ID instead of created_at
        )
        return result.scalars().all()
    
    async def get_by_user_with_count(self, user_id: int, skip: int = 0, limit: int = 100, search: str = None) -> tuple[List[Facture], int]:
        """
        Get invoices by user with total count and optional search
        
        Args:
            user_id: ID of the user
            skip: Number of records to skip
            limit: Maximum number of records to return
            search: Optional search term to filter invoices
            
        Returns:
            Tuple of (list of invoices, total count)
        """
        
        # Base query
        query = select(Facture).where(Facture.created_by == user_id)
        
        # Add search conditions if search term is provided
        if search and search.strip():
            search_terms = search.strip()
            
            # Initialize date filters
            date_facturation_filter = None
            date_ajout_filter = None
            
            # Check for date filters
            if 'date:' in search_terms:
                try:
                    date_part = search_terms.split('date:')[1].split()[0]  # Get the date part
                    from datetime import datetime
                    date_facturation_filter = datetime.strptime(date_part, '%Y-%m-%d').date()
                    search_terms = search_terms.replace(f'date:{date_part}', '').strip()
                except (ValueError, IndexError):
                    pass
                    
            if 'date_ajout:' in search_terms:
                try:
                    date_part = search_terms.split('date_ajout:')[1].split()[0]  # Get the date part
                    from datetime import datetime
                    date_ajout_filter = datetime.strptime(date_part, '%Y-%m-%d').date()
                    search_terms = search_terms.replace(f'date_ajout:{date_part}', '').strip()
                except (ValueError, IndexError):
                    pass
            
            # Build search conditions
            conditions = []
            
            # Add date filters if we have valid dates
            if date_facturation_filter is not None:
                conditions.append(Facture.dateFacturation == date_facturation_filter)
                
            if date_ajout_filter is not None:
                conditions.append(func.date(Facture.date_creation) == date_ajout_filter)
            
            # Add text search conditions if search term is not empty after removing date filters
            if search_terms:
                text_conditions = or_(
                    Facture.numFacture.ilike(f"%{search_terms}%"),
                    Facture.fournisseur.ilike(f"%{search_terms}%"),
                    Facture.montantTTC.cast(String).ilike(f"%{search_terms}%"),
                    Facture.montantHT.cast(String).ilike(f"%{search_terms}%"),
                    Facture.montantTVA.cast(String).ilike(f"%{search_terms}%"),
                    Facture.tauxTVA.cast(String).ilike(f"%{search_terms}%")
                )
                conditions.append(text_conditions)
            
            # Apply all conditions with AND between them
            if conditions:
                query = query.where(and_(*conditions))
        
        # Get total count with search conditions applied
        # Create a base query for counting
        count_query = select(func.count(Facture.id)).where(Facture.created_by == user_id)
        
        # Apply the same search conditions to the count query
        if search and search.strip():
            search_terms = search.strip()
            
            # Initialize date filters for count query
            date_facturation_filter = None
            date_ajout_filter = None
            
            # Check for date filters in count query
            if 'date:' in search_terms:
                try:
                    date_part = search_terms.split('date:')[1].split()[0]
                    from datetime import datetime
                    date_facturation_filter = datetime.strptime(date_part, '%Y-%m-%d').date()
                    search_terms = search_terms.replace(f'date:{date_part}', '').strip()
                except (ValueError, IndexError):
                    pass
                    
            if 'date_ajout:' in search_terms:
                try:
                    date_part = search_terms.split('date_ajout:')[1].split()[0]
                    from datetime import datetime
                    date_ajout_filter = datetime.strptime(date_part, '%Y-%m-%d').date()
                    search_terms = search_terms.replace(f'date_ajout:{date_part}', '').strip()
                except (ValueError, IndexError):
                    pass
            
            # Build search conditions for count query
            count_conditions = []
            
            # Add date filters if we have valid dates
            if date_facturation_filter is not None:
                count_conditions.append(Facture.dateFacturation == date_facturation_filter)
                
            if date_ajout_filter is not None:
                count_conditions.append(func.date(Facture.date_creation) == date_ajout_filter)
            
            # Add text search conditions if search term is not empty after removing date filters
            if search_terms:
                text_conditions = or_(
                    Facture.numFacture.ilike(f"%{search_terms}%"),
                    Facture.fournisseur.ilike(f"%{search_terms}%"),
                    Facture.montantTTC.cast(String).ilike(f"%{search_terms}%"),
                    Facture.montantHT.cast(String).ilike(f"%{search_terms}%"),
                    Facture.montantTVA.cast(String).ilike(f"%{search_terms}%"),
                    Facture.tauxTVA.cast(String).ilike(f"%{search_terms}%")
                )
                count_conditions.append(text_conditions)
            
            # Apply all conditions with AND between them
            if count_conditions:
                count_query = count_query.where(and_(*count_conditions))
        
        count_result = await self.session.execute(count_query)
        total_count = count_result.scalar()
        # Get paginated results
        query = query.order_by(desc(Facture.dateFacturation)).offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        invoices = result.scalars().all()
        
        return invoices, total_count
    
    async def update(self, facture_id: int, user_id: int, update_data: dict) -> Optional[Facture]:
        """Update invoice by ID (only if user owns it)"""
        # First check if user owns the invoice
        facture = await self.get_by_id(facture_id)
        if not facture or facture.created_by != user_id:
            return None
        
        # Update the invoice
        await self.session.execute(
            update(Facture)
            .where(Facture.id == facture_id)
            .values(**update_data)
        )
        await self.session.commit()
        
        # Return updated invoice
        await self.session.refresh(facture)
        return facture
    
    async def delete(self, facture_id: int, user_id: int) -> bool:
        """Delete invoice by ID (only if user owns it)"""
        facture = await self.get_by_id(facture_id)
        if not facture or facture.created_by != user_id:
            return False
        
        await self.session.execute(
            delete(Facture).where(Facture.id == facture_id)
        )
        await self.session.commit()
        return True
