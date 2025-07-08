import time
import logging
from collections import defaultdict
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from ..config import SECURITY_CONFIG

logger = logging.getLogger(__name__)

# In-memory store for rate limiting (use Redis in production)
request_counts = defaultdict(list)

class SecurityMiddleware:
    """Security middleware for rate limiting and IP blocking"""
    
    @staticmethod
    def is_ip_blocked(ip: str) -> bool:
        """Check if IP is in the blocked list"""
        return ip in SECURITY_CONFIG.get("BLOCKED_IPS", [])
    
    @staticmethod
    def is_rate_limited(ip: str) -> bool:
        """Check if IP has exceeded rate limit"""
        now = time.time()
        window = SECURITY_CONFIG.get("RATE_LIMIT_WINDOW", 60)
        max_requests = SECURITY_CONFIG.get("RATE_LIMIT_REQUESTS", 100)
        
        # Clean old entries
        request_counts[ip] = [
            timestamp for timestamp in request_counts[ip] 
            if now - timestamp < window
        ]
        
        # Check if rate limited
        if len(request_counts[ip]) >= max_requests:
            return True
        
        # Add current request
        request_counts[ip].append(now)
        return False
    
    @staticmethod
    async def check_security(request: Request):
        """Main security check function"""
        client_ip = request.client.host
        
        # Check if IP is blocked
        if SecurityMiddleware.is_ip_blocked(client_ip):
            if SECURITY_CONFIG.get("LOG_SECURITY_EVENTS", True):
                logger.warning(f"Blocked request from banned IP: {client_ip} to {request.url.path}")
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Check rate limiting
        if SecurityMiddleware.is_rate_limited(client_ip):
            if SECURITY_CONFIG.get("LOG_SECURITY_EVENTS", True):
                logger.warning(f"Rate limit exceeded for IP: {client_ip}")
            raise HTTPException(status_code=429, detail="Too many requests")

def get_real_ip(request: Request) -> str:
    """Get real client IP considering proxies"""
    # Check for forwarded headers (common in reverse proxy setups)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    return request.client.host 