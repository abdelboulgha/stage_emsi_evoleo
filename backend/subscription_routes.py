"""
API routes for subscription and payment management
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database.config import get_async_db
from services.subscription_service import SubscriptionService
from auth.auth_jwt import require_comptable_or_admin
from pydantic import BaseModel
from typing import Dict, Any, Optional

router = APIRouter(prefix="/subscription", tags=["subscription"])

# Pydantic models for request/response
class SubscriptionRequest(BaseModel):
    plan_type: str
    payment_method_id: str

class CardDetails(BaseModel):
    brand: str
    last4: str
    exp_month: int
    exp_year: int

class SubscriptionResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None

@router.get("/plans")
async def get_available_plans():
    """Get all available subscription plans"""
    try:
        plans = SubscriptionService.get_available_plans()
        return {
            "success": True,
            "plans": plans
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status")
async def check_subscription_status(
    request: Request,
    db: Session = Depends(get_async_db),
    current_user = Depends(require_comptable_or_admin)
):
    """Check current user's subscription status"""
    try:
        user_id = current_user["id"]  # Changé de "user_id" à "id"
        status = await SubscriptionService.check_subscription_status(db, user_id)
        return {
            "success": True,
            "status": status
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/create")
async def create_subscription(
    subscription_request: SubscriptionRequest,
    request: Request,
    db: Session = Depends(get_async_db),
    current_user = Depends(require_comptable_or_admin)
):
    """Create a new subscription for the current user"""
    try:
        user_id = current_user["id"]  # Changé de "user_id" à "id"
        
        # Check if user already has an active subscription
        current_status = await SubscriptionService.check_subscription_status(db, user_id)
        if current_status["has_subscription"]:
            # Instead of blocking, allow new subscription creation
            print(f"User {user_id} already has subscription, but allowing new one")
            # You could also deactivate the old one here if needed
        
        # Create subscription
        result = await SubscriptionService.create_subscription(
            db=db,
            user_id=user_id,
            plan_type=subscription_request.plan_type,
            payment_method_id=subscription_request.payment_method_id
        )
        
        return {
            "success": True,
            "message": "Subscription created successfully",
            "data": result
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/cards")
async def get_user_cards(
    request: Request,
    db: Session = Depends(get_async_db),
    current_user = Depends(require_comptable_or_admin)
):
    """Get all saved cards for the current user"""
    try:
        user_id = current_user["id"]  # Changé de "user_id" à "id"
        cards = await SubscriptionService.get_user_cards(db, user_id)
        return {
            "success": True,
            "cards": cards
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cards/save")
async def save_user_card(
    card_details: CardDetails,
    payment_method_id: str,
    request: Request,
    db: Session = Depends(get_async_db),
    current_user = Depends(require_comptable_or_admin)
):
    """Save user's card information"""
    try:
        user_id = current_user["id"]  # Changé de "user_id" à "id"
        
        result = await SubscriptionService.save_user_card(
            db=db,
            user_id=user_id,
            payment_method_id=payment_method_id,
            card_details=card_details.dict()
        )
        
        return {
            "success": True,
            "message": "Card saved successfully",
            "data": result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/verify-access")
async def verify_service_access(
    request: Request,
    db: Session = Depends(get_async_db),
    current_user = Depends(require_comptable_or_admin)
):
    """Verify if user can access services (for extraction, etc.)"""
    try:
        user_id = current_user["id"]  # Changé de "user_id" à "id"
        status = await SubscriptionService.check_subscription_status(db, user_id)
        
        if not status["can_access_services"]:
            return {
                "success": False,
                "can_access": False,
                "message": "Subscription required to access services",
                "redirect_to_subscription": True
            }
        
        return {
            "success": True,
            "can_access": True,
            "message": "Access granted"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
