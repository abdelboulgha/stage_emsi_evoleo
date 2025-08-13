"""
Invoice service for managing invoices
"""
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from database.repositories import FactureRepository, FieldNameRepository
from database.models import Facture


class FactureService:
    """Service for invoice operations"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.facture_repo = FactureRepository(session)
        self.field_repo = FieldNameRepository(session)
    
    async def create_facture(self, facture_data: Dict[str, Any], current_user_id: int) -> Dict[str, Any]:
        """
        Create a new invoice
        
        Args:
            facture_data: Invoice data dictionary
            current_user_id: User ID who is creating the invoice
            
        Returns:
            Dict containing the created invoice or error information
        """
        try:
            print(f"=== DEBUG create_facture ===")
            print(f"Input data: {facture_data}")
            print(f"Current user ID: {current_user_id}")
            
            # Add created_by to the data
            facture_data["created_by"] = current_user_id
            
            # Convert date string to datetime if present
            if "dateFacturation" in facture_data and facture_data["dateFacturation"]:
                try:
                    if isinstance(facture_data["dateFacturation"], str):
                        facture_data["dateFacturation"] = datetime.fromisoformat(facture_data["dateFacturation"])
                        print(f"Converted date: {facture_data['dateFacturation']}")
                except ValueError as ve:
                    print(f"Date conversion error: {ve}")
                    return {
                        "success": False,
                        "message": "Invalid date format for dateFacturation"
                    }
            
            print(f"Final data to save: {facture_data}")
            
            # Create the invoice
            facture = await self.facture_repo.create(facture_data)
            print(f"Created facture: {facture}")
            print(f"Facture ID: {facture.id}")
            
            return {
                "success": True,
                "facture": facture.to_dict()
            }
            
        except Exception as e:
            print(f"Error in create_facture: {e}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
            await self.session.rollback()
            return {
                "success": False,
                "message": f"Error creating invoice: {str(e)}"
            }
    
    async def update_facture(self, facture_id: int, update_data: Dict[str, Any], current_user_id: int) -> Dict[str, Any]:
        """
        Update an existing invoice
        
        Args:
            facture_id: ID of the invoice to update
            update_data: Data to update
            current_user_id: User ID who is updating the invoice
            
        Returns:
            Dict containing the updated invoice or error information
        """
        try:
            # Convert date string to datetime if present
            if "dateFacturation" in update_data and update_data["dateFacturation"]:
                try:
                    if isinstance(update_data["dateFacturation"], str):
                        update_data["dateFacturation"] = datetime.fromisoformat(update_data["dateFacturation"])
                except ValueError:
                    return {
                        "success": False,
                        "message": "Invalid date format for dateFacturation"
                    }
            
            # Update the invoice
            updated_facture = await self.facture_repo.update(facture_id, current_user_id, update_data)
            
            if updated_facture:
                return {
                    "success": True,
                    "facture": updated_facture.to_dict()
                }
            else:
                return {
                    "success": False,
                    "message": "Invoice not found or you don't have permission to update it"
                }
                
        except Exception as e:
            await self.session.rollback()
            return {
                "success": False,
                "message": f"Error updating invoice: {str(e)}"
            }
    
    async def get_factures(self, current_user_id: int, skip: int = 0, limit: int = 100) -> Dict[str, Any]:
        """
        Get invoices for a user with pagination
        
        Args:
            current_user_id: User ID to get invoices for
            skip: Number of records to skip
            limit: Maximum number of records to return
            
        Returns:
            Dict containing the invoices and total count
        """
        try:
            invoices, total_count = await self.facture_repo.get_by_user_with_count(
                current_user_id, skip, limit
            )
            
            return {
                "success": True,
                "factures": [invoice.to_dict() for invoice in invoices],
                "total_count": total_count,
                "skip": skip,
                "limit": limit
            }
            
        except Exception as e:
            return {
                "success": False,
                "message": f"Error getting invoices: {str(e)}"
            }
    
    async def delete_facture(self, facture_id: int, current_user_id: int) -> Dict[str, Any]:
        """
        Delete an invoice
        
        Args:
            facture_id: ID of the invoice to delete
            current_user_id: User ID who is deleting the invoice
            
        Returns:
            Dict containing the result of the deletion
        """
        try:
            success = await self.facture_repo.delete(facture_id, current_user_id)
            
            if success:
                return {
                    "success": True,
                    "message": "Invoice deleted successfully"
                }
            else:
                return {
                    "success": False,
                    "message": "Invoice not found or you don't have permission to delete it"
                }
                
        except Exception as e:
            return {
                "success": False,
                "message": f"Error deleting invoice: {str(e)}"
            }
    
    async def get_field_coordinates(self, field_name: str) -> Optional[Dict[str, float]]:
        """
        Get field coordinates from the database
        
        Args:
            field_name: Name of the field to get coordinates for
            
        Returns:
            Dict containing coordinates or None if not found
        """
        try:
            # Get field ID
            field = await self.field_repo.get_by_name(field_name)
            if not field:
                return None
            
            # Get coordinates from mappings (this would need to be implemented based on your needs)
            # For now, return None as this seems to be used for OCR extraction
            return None
            
        except Exception as e:
            print(f"Error getting field coordinates: {e}")
            return None
