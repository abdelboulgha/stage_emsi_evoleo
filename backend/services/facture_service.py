"""
Invoice service for managing invoices
"""
from typing import Dict, Any, Optional, List, Tuple, Set
from datetime import datetime
from sqlalchemy import or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
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
        Create a new invoice with sous_valeurs
        
        Args:
            facture_data: Dictionary containing invoice data including sous_valeurs
            current_user_id: ID of the current user creating the invoice
            
        Returns:
            Dictionary with success status and created invoice data
        """
        try:
            print(f"=== DEBUG create_facture ===")
            print(f"Input data: {facture_data}")
            print(f"Current user ID: {current_user_id}")
            
            # Extract sous_valeurs if present
            sous_valeurs = facture_data.pop('sous_valeurs', [])
            
            # Add created_by to the data
            facture_data['created_by'] = current_user_id
            
            # Convert date string to datetime if needed
            if 'dateFacturation' in facture_data and isinstance(facture_data['dateFacturation'], str):
                from datetime import datetime
                try:
                    facture_data['dateFacturation'] = datetime.fromisoformat(facture_data['dateFacturation'])
                    print(f"Converted date: {facture_data['dateFacturation']}")
                except (ValueError, TypeError) as e:
                    print(f"Error converting date: {e}")
                    return {
                        "success": False,
                        "message": "Invalid date format for dateFacturation"
                    }
            
            print(f"Final data to save: {facture_data}")
            
            try:
                # Create the main facture without committing
                facture = await self.facture_repo.create(facture_data, commit=False)
                print(f"Created facture: {facture}")
                print(f"Facture ID: {facture.id}")
                
                # Add sous_valeurs if any
                if sous_valeurs:
                    print(f"Processing {len(sous_valeurs)} sous_valeurs")
                    from database.models import SousValeurs
                    for i, sv_data in enumerate(sous_valeurs, 1):
                        print(f"  Sous_valeur {i}: {sv_data}")
                        try:
                            # Ensure all required fields are present and have the correct type
                            sv_data = {
                                'HT': float(sv_data.get('HT', 0)),
                                'TVA': float(sv_data.get('TVA', 0)),
                                'TTC': float(sv_data.get('TTC', 0)),
                                'facture_id': facture.id
                            }
                            print(f"  Processed sous_valeur: {sv_data}")
                            sv = SousValeurs(**sv_data)
                            self.session.add(sv)
                            print(f"  Added sous_valeur to session")
                        except Exception as e:
                            print(f"  Error processing sous_valeur: {e}")
                            continue
                
                # Commit the transaction
                await self.session.commit()
                
                # Clear the session to avoid any stale state
                self.session.expunge_all()
                
                # Fetch the facture with its sous_valeurs using a fresh query with eager loading
                facture_with_relations = await self.facture_repo.get_by_id(facture.id)
                
                if not facture_with_relations:
                    return {
                        "success": False,
                        "message": "Failed to retrieve created invoice"
                    }
                    
                # Convert to dict with sous_valeurs
                result = {
                    "success": True,
                    "facture": facture_with_relations.to_dict(include_sous_valeurs=True)
                }
                print(f"Returning result: {result}")
                return result
                
            except Exception as e:
                await self.session.rollback()
                raise
            
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
                    "facture": updated_facture.to_dict(include_sous_valeurs=True)
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
    
    async def get_factures(self, current_user_id: int, skip: int = 0, limit: int = 100, search: str = None) -> Dict[str, Any]:
        """
        Get invoices for a user with pagination and search
        
        Args:
            current_user_id: User ID to get invoices for
            skip: Number of records to skip
            limit: Maximum number of records to return
            search: Optional search term to filter invoices
            
        Returns:
            Dict containing the invoices and total count
        """
        try:
            invoices, total_count = await self.facture_repo.get_by_user_with_count(
                current_user_id, skip, limit, search
            )
            
            return {
                "success": True,
                "factures": [invoice.to_dict(include_sous_valeurs=True) for invoice in invoices],
                "total_count": total_count,
                "skip": skip,
                "limit": limit
            }
            
        except Exception as e:
            return {
                "success": False,
                "message": f"Error getting invoices: {str(e)}"
            }
    
    async def get_facture_by_id(self, facture_id: int, current_user_id: int) -> Dict[str, Any]:
        """
        Get invoice by ID
        
        """
        facture = await self.facture_repo.get_by_id(facture_id)
        if not facture or facture.created_by != current_user_id:
            return {"success": False, "message": "Invoice not found or access denied"}
        return {"success": True, "facture": facture.to_dict(include_sous_valeurs=True)}
    
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
    
    async def check_duplicate_invoices(self, invoices_data: List[Dict[str, Any]], user_id: int) -> List[int]:
        """
        Check if invoices already exist in the database.
        This expects the invoice numbers to be already cleaned/filtered from the frontend.
        
        Args:
            invoices_data: List of invoice data dictionaries with cleaned values
            user_id: ID of the current user
            
        Returns:
            List of indices of duplicate invoices
        """
        try:
            if not invoices_data:
                return []
                
            # Extract invoice numbers and suppliers (already cleaned by frontend)
            invoice_identifiers = []
            for i, inv in enumerate(invoices_data):
                # Use the cleaned values directly
                num_facture = str(inv.get('numeroFacture') or inv.get('numFacture') or '').strip()
                fournisseur = str(inv.get('fournisseur') or '').strip()
                
                if num_facture and fournisseur:
                    invoice_identifiers.append((i, num_facture, fournisseur))
            
            if not invoice_identifiers:
                return []
            
            # Get all existing invoices for this user to check against
            stmt = (
                select(Facture.numFacture, Facture.fournisseur)
                .where(Facture.created_by == user_id)
            )
            
            result = await self.session.execute(stmt)
            existing_invoices = result.all()
            
            # Create a set of (numFacture, fournisseur) tuples for quick lookup
            existing_set = {
                (str(row.numFacture).strip().lower(), 
                 str(row.fournisseur).strip().lower())
                for row in existing_invoices
            }
            
            # Find which of our input invoices already exist
            duplicate_indices = []
            for idx, num, four in invoice_identifiers:
                # Compare case-insensitive and stripped
                norm_num = str(num).strip().lower()
                norm_four = str(four).strip().lower()
                
                if (norm_num, norm_four) in existing_set:
                    duplicate_indices.append(idx)
            
            return duplicate_indices
            
        except Exception as e:
            import traceback
            print(f"[ERROR] Error checking for duplicate invoices: {e}")
            print(traceback.format_exc())
            return []
    
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
