"""
Service for managing user subscriptions and payments
"""
import stripe
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database.models import User, Subscription, Payment, UserCard
from dotenv import load_dotenv

load_dotenv()

# Stripe configuration
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

class SubscriptionService:
    """Service for managing subscriptions and payments"""
    
    # Plan configurations
    PLANS = {
        "trial": {
            "name": "Essai gratuit",
            "duration_days": 7,
            "amount": 0.0,
            "description": "1 semaine d'essai gratuit"
        },
        "monthly": {
            "name": "Abonnement mensuel",
            "duration_days": 30,
            "amount": 100.0,
            "description": "1 mois d'accès complet"
        },
        "semester": {
            "name": "Abonnement semestriel",
            "duration_days": 180,
            "amount": 500.0,
            "description": "6 mois d'accès complet"
        },
        "yearly": {
            "name": "Abonnement annuel",
            "duration_days": 365,
            "amount": 800.0,
            "description": "1 an d'accès complet"
        }
    }
    
    @classmethod
    def get_available_plans(cls) -> Dict[str, Dict[str, Any]]:
        """Get all available subscription plans"""
        return cls.PLANS
    
    @classmethod
    async def create_subscription(
        cls, 
        db: AsyncSession, 
        user_id: int, 
        plan_type: str,
        payment_method_id: str
    ) -> Dict[str, Any]:
        """Create a new subscription for a user"""
        
        if plan_type not in cls.PLANS:
            raise ValueError(f"Invalid plan type: {plan_type}")
        
        plan = cls.PLANS[plan_type]
        
        # Calculate subscription dates
        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=plan["duration_days"])
        
        # Create Stripe payment intent if not trial
        stripe_payment_intent_id = None
        if plan["amount"] > 0:
            try:
                payment_intent = stripe.PaymentIntent.create(
                    amount=int(plan["amount"] * 100),  # Convert to cents
                    currency="mad",
                    payment_method=payment_method_id,
                    confirm=True,
                    return_url="http://localhost:3000/payment-success"
                )
                stripe_payment_intent_id = payment_intent.id
            except stripe.error.StripeError as e:
                raise Exception(f"Stripe payment failed: {str(e)}")
        
        # Create subscription in database
        subscription = Subscription(
            user_id=user_id,
            plan_type=plan_type,
            amount=plan["amount"],
            start_date=start_date,
            end_date=end_date,
            is_active=True,
            stripe_subscription_id=stripe_payment_intent_id
        )
        
        db.add(subscription)
        await db.commit()
        await db.refresh(subscription)
        
        # Create payment record
        if plan["amount"] > 0:
            payment = Payment(
                subscription_id=subscription.id,
                amount=plan["amount"],
                currency="MAD",
                stripe_payment_intent_id=stripe_payment_intent_id,
                status="succeeded" if stripe_payment_intent_id else "pending",
                payment_method="card"
            )
            db.add(payment)
            await db.commit()
        
        return {
            "subscription_id": subscription.id,
            "plan_type": plan_type,
            "amount": plan["amount"],
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "status": "active"
        }
    
    @classmethod
    async def get_user_subscription(cls, db: AsyncSession, user_id: int) -> Optional[Dict[str, Any]]:
        """Get the current active subscription for a user"""
        stmt = select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.is_active == True,
            Subscription.end_date > datetime.utcnow()
        )
        result = await db.execute(stmt)
        subscription = result.scalar_one_or_none()
        
        if not subscription:
            return None
        
        return {
            "id": subscription.id,
            "plan_type": subscription.plan_type,
            "amount": float(subscription.amount),
            "start_date": subscription.start_date.isoformat(),
            "end_date": subscription.end_date.isoformat(),
            "is_active": subscription.is_active,
            "days_remaining": (subscription.end_date - datetime.utcnow()).days
        }
    
    @classmethod
    async def check_subscription_status(cls, db: AsyncSession, user_id: int) -> Dict[str, Any]:
        """Check if user has an active subscription"""
        subscription = await cls.get_user_subscription(db, user_id)
        
        if subscription:
            return {
                "has_subscription": True,
                "subscription": subscription,
                "can_access_services": True
            }
        else:
            return {
                "has_subscription": False,
                "subscription": None,
                "can_access_services": False
            }
    
    @classmethod
    async def save_user_card(
        cls, 
        db: AsyncSession, 
        user_id: int, 
        payment_method_id: str,
        card_details: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Save user's card information"""
        
        # Check if card already exists
        stmt = select(UserCard).where(
            UserCard.user_id == user_id,
            UserCard.stripe_payment_method_id == payment_method_id
        )
        result = await db.execute(stmt)
        existing_card = result.scalar_one_or_none()
        
        if existing_card:
            return {"message": "Card already exists", "card_id": existing_card.id}
        
        # Create new card record
        card = UserCard(
            user_id=user_id,
            stripe_payment_method_id=payment_method_id,
            card_brand=card_details.get("brand", "unknown"),
            last4=card_details.get("last4", ""),
            expiry_month=card_details.get("exp_month", 0),
            expiry_year=card_details.get("exp_year", 0),
            is_default=True  # Set as default for now
        )
        
        db.add(card)
        await db.commit()
        await db.refresh(card)
        
        return {
            "card_id": card.id,
            "message": "Card saved successfully"
        }
    
    @classmethod
    async def get_user_cards(cls, db: AsyncSession, user_id: int) -> List[Dict[str, Any]]:
        """Get all saved cards for a user"""
        stmt = select(UserCard).where(UserCard.user_id == user_id)
        result = await db.execute(stmt)
        cards = result.scalars().all()
        
        return [
            {
                "id": card.id,
                "brand": card.card_brand,
                "last4": card.last4,
                "exp_month": card.expiry_month,
                "exp_year": card.expiry_year,
                "is_default": card.is_default
            }
            for card in cards
        ]
