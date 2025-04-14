from typing import List, Dict, Any
from sqlalchemy.orm import Session
from ..models import User
import logging

logger = logging.getLogger(__name__)

def get_users(db: Session) -> List[Dict[str, Any]]:
    """Get all registered users"""
    users = db.query(User).all()
    return [
        {
            "user_id": user.user_id,
            "name": user.name,
            "created_at": user.created_at.isoformat() if user.created_at else None
        }
        for user in users
    ]

def delete_user(user_id: str, db: Session) -> Dict[str, Any]:
    """Delete a user"""
    # Find the user
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise ValueError("User not found")

    # Delete the user
    db.delete(user)
    db.commit()

    logger.info(f"User deleted successfully: {user_id}")
    return {"message": "User deleted successfully"} 