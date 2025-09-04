"""
Template service for managing document templates and mappings
"""
from datetime import datetime
from typing import Dict, Any, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from database.repositories import TemplateRepository, MappingRepository, FieldNameRepository
from database.models import Template, Mapping


class TemplateService:
    """Service for template operations"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.template_repo = TemplateRepository(session)
        self.mapping_repo = MappingRepository(session)
        self.field_repo = FieldNameRepository(session)
    
    async def save_mapping(self, template_name: str, field_map: Dict[str, Any], current_user_id: int) -> bool:
        """
        Save field mappings to the database with user ownership check
        
        Args:
            template_name: The name of the template to save mappings for
            field_map: Dictionary of field names to their data 
            current_user_id: User ID who is creating/updating the template
            
        Returns:
            bool: True if save was successful, False otherwise
        """
        try:
            # 1. Check if template with this name already exists for this user
            template = await self.template_repo.get_by_name_and_user(template_name, current_user_id)
            
            # 2. If template exists, get its ID, otherwise create new template
            if template:
                template_id = template.id
                
                # Update template metadata if needed
                needs_update = False
                
                if 'serial' in field_map and field_map['serial'] and 'manualValue' in field_map['serial']:
                    serial_value = str(field_map['serial']['manualValue'])
                    if len(serial_value) == 9:  # Only update if valid 9-digit serial
                        template.serial = serial_value
                        needs_update = True
                
                if needs_update:
                    template.updated_at = datetime.utcnow()
                    self.session.add(template)
                    await self.session.commit()
            else:
                # Create new template with initial data
                template_data = {
                    'name': template_name,
                    'created_by': current_user_id
                }
                
                # Add serial if valid
                if 'serial' in field_map and field_map['serial'] and 'manualValue' in field_map['serial']:
                    serial_value = str(field_map['serial']['manualValue'])
                    if len(serial_value) == 9:  # Only add if valid 9-digit serial
                        template_data['serial'] = serial_value
                
                template = await self.template_repo.create(template_data)
                template_id = template.id
            
            # Remove manual input fields from field_map to avoid processing as coordinates
            field_map.pop('serial', None)
            
            # 3. Delete existing mappings for this template
            await self.mapping_repo.delete_by_template_id(template_id)
            
            # 4. Prepare new mappings data
            mappings_data = []
            for field_name, coords in field_map.items():
                if coords is not None:
                    # Get the field_id for this field_name
                    field = await self.field_repo.get_by_name(field_name)
                    
                    if field:
                        mappings_data.append({
                            "template_id": template_id,
                            "field_id": field.id,
                            "left": coords.get('left', 0.0),
                            "top": coords.get('top', 0.0),
                            "width": coords.get('width', 0.0),
                            "height": coords.get('height', 0.0),
                     
                            "created_by": current_user_id
                        })
            
            # 5. Create new mappings
            if mappings_data:
                await self.mapping_repo.create_mappings(mappings_data)
            
            return True
            
        except Exception as e:
            await self.session.rollback()
            raise e
    
    async def load_mapping(self, template_id: str) -> Dict[str, Any]:
        """
        Load field mappings from the database using field names
        
        Args:
            template_id: The template ID to load mappings for
            
        Returns:
            Dict containing the mappings or error information
        """
        try:
            # Convert template_id to int if it's a string
            try:
                template_id_int = int(template_id)
            except ValueError:
                return {
                    "status": "error",
                    "message": f"Invalid template ID: {template_id}",
                    "mappings": {}
                }
            
            # Get all mappings for this template
            mappings = await self.mapping_repo.get_by_template_id(template_id_int)
            
            field_map = {}
            for mapping, field_name in mappings:
                try:
                    field_map[field_name] = {
                        'left': float(mapping.left) if mapping.left is not None else 0.0,
                        'top': float(mapping.top) if mapping.top is not None else 0.0,
                        'width': float(mapping.width) if mapping.width is not None else 0.0,
                        'height': float(mapping.height) if mapping.height is not None else 0.0,
                  
                    }
                except (ValueError, TypeError) as e:
                    # Log error but continue processing other fields
                    print(f"Error processing coordinates for field {field_name}: {e}")
            
            return {
                "status": "success",
                "mappings": {
                    template_id: field_map
                }
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": f"Error loading mapping from database: {str(e)}",
                "mappings": {}
            }
    
    async def delete_template(self, template_id: str, current_user_id: int) -> Dict[str, Any]:
        """
        Delete a template and all its mappings
        
        Args:
            template_id: The template ID to delete
            current_user_id: User ID who is deleting the template
            
        Returns:
            Dict containing the result of the deletion
        """
        try:
            # Convert template_id to int if it's a string
            try:
                template_id_int = int(template_id)
            except ValueError:
                return {
                    "success": False,
                    "message": f"Invalid template ID: {template_id}"
                }
            
            # Check if template exists and user owns it
            template = await self.template_repo.get_by_id(template_id_int)
            if not template:
                return {
                    "success": False,
                    "message": f"Template with ID {template_id} not found"
                }
            
            if template.created_by != current_user_id:
                return {
                    "success": False,
                    "message": "You don't have permission to delete this template"
                }
            
            # Delete template and mappings
            success = await self.template_repo.delete_template_and_mappings(template_id_int)
            
            if success:
                return {
                    "success": True,
                    "message": f"Template '{template_id}' and its mappings have been successfully deleted"
                }
            else:
                return {
                    "success": False,
                    "message": "Error deleting template"
                }
                
        except Exception as e:
            return {
                "success": False,
                "message": f"Error deleting template: {str(e)}"
            }
    
    async def get_all_templates(self, current_user_id: int) -> Dict[str, Any]:
        """
        Get all templates and their mappings for the current user
        
        Args:
            current_user_id: User ID to get templates for
            
        Returns:
            Dict containing all templates and their mappings in the EXACT same format as the old code
        """
        try:
            # Get all templates for this user
            templates = await self.template_repo.get_by_user_id(current_user_id)
            
            # Format result exactly like the old code
            result = {}
            for template in templates:
                # Get mappings for this template
                mappings = await self.mapping_repo.get_by_template_id(template.id)
                
                # Format like the old code: template_id as key with template_name and fields
                result[template.id] = {
                    'template_name': template.name,
                    'fields': {}
                }
                
                for mapping, field_name in mappings:
                    try:
                        result[template.id]['fields'][field_name] = {
                            'left': float(mapping.left) if mapping.left is not None else 0.0,
                            'top': float(mapping.top) if mapping.top is not None else 0.0,
                            'width': float(mapping.width) if mapping.width is not None else 0.0,
                            'height': float(mapping.height) if mapping.height is not None else 0.0,
                         
                        }
                    except (ValueError, TypeError) as e:
                        # Log error but continue processing other fields
                        print(f"Error processing coordinates for field {field_name}: {e}")
            
            return {
                "status": "success",
                "mappings": result,
                "count": sum(len(result[tid]['fields']) for tid in result),
                "template_count": len(result)
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": f"Error getting templates: {str(e)}",
                "mappings": {}
            }
