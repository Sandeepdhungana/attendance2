# Security Enhancements - Face Attendance System

## 🚨 Security Alerts Addressed

### 1. Git Repository Exposure Attempts
**Issue**: Multiple requests detected trying to access `/.git/config` from IP `194.50.16.252`
**Status**: ✅ **BLOCKED**

### 2. Overly Permissive CORS Configuration
**Issue**: CORS was set to allow origins from `["*"]` - any domain could access your API
**Status**: ✅ **RESTRICTED**

### 3. ASGI Lifespan Protocol Warning
**Issue**: FastAPI was using deprecated event handlers
**Status**: ✅ **FIXED**

## 🛡️ Security Measures Implemented

### 1. **Path Protection Middleware**
- Automatically blocks access to sensitive files and directories:
  - `.git/` directories and files
  - `.env` files
  - `.ssh/` directories
  - Configuration files (`config.ini`, `web.config`, etc.)
  - Database files and backups
  - Other sensitive paths

### 2. **IP Blocking System**
- **Blocked IPs**: `194.50.16.252` (the IP that was probing your server)
- Easy to add more IPs to the blocked list in `config.py`
- Logs all blocked attempts for monitoring

### 3. **Rate Limiting**
- **Limit**: 100 requests per minute per IP address
- **Window**: 60 seconds
- Prevents DoS attacks and automated scanning
- Returns HTTP 429 "Too Many Requests" when exceeded

### 4. **Security Headers**
Added essential security headers to all responses:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
```

### 5. **Restricted CORS Policy**
- **Before**: `allow_origins=["*"]` (any domain)
- **After**: Specific allowed origins only:
  - `http://localhost:3000` (React dev)
  - `http://localhost:8080` (Vue dev)
  - `http://127.0.0.1:3000`
  - `http://127.0.0.1:8080`

### 6. **Enhanced Logging**
- All security events are logged with IP addresses
- Blocked access attempts are tracked
- Rate limit violations are monitored

## 📋 Configuration

### Adding Production Domains
Update `backend/app/config.py`:
```python
SECURITY_CONFIG = {
    "ALLOWED_ORIGINS": [
        "http://localhost:3000",
        "http://localhost:8080", 
        "https://yourdomain.com",      # Add your production domain
        "https://www.yourdomain.com",  # Add www version
    ],
}
```

### Blocking Additional IPs
Add to the `BLOCKED_IPS` list in `config.py`:
```python
"BLOCKED_IPS": [
    "194.50.16.252",  # Existing blocked IP
    "1.2.3.4",        # Add new IPs here
    "5.6.7.8",
]
```

### Adjusting Rate Limits
Modify in `config.py`:
```python
"RATE_LIMIT_REQUESTS": 100,  # requests per minute
"RATE_LIMIT_WINDOW": 60,     # seconds
```

## 🔍 Monitoring

### Security Logs
Watch your logs for these security events:
- `Blocked access attempt to sensitive path`
- `Blocked request from banned IP`
- `Rate limit exceeded for IP`

### Recommended Log Monitoring
```bash
# Watch for security events
tail -f your_log_file.log | grep -E "(Blocked|Rate limit|security)"
```

## ⚡ Performance Notes

### Rate Limiting Storage
- Currently uses in-memory storage (suitable for single-server setups)
- For production/cluster deployments, consider Redis:
  ```python
  # Replace in-memory storage with Redis
  import redis
  redis_client = redis.Redis(host='localhost', port=6379, db=0)
  ```

### IP Blocking
- IP checks are performed on every request
- Consider implementing IP whitelist for trusted sources
- Monitor logs to identify new threats

## 🚀 Deployment Recommendations

### 1. **Reverse Proxy Setup**
If using nginx/Apache, ensure proper IP forwarding:
```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

### 2. **HTTPS Only**
- Enable HTTPS in production
- Update CORS origins to use `https://`
- Consider HSTS preloading

### 3. **Firewall Rules**
- Block suspicious IPs at firewall level
- Whitelist known good IPs if possible
- Monitor failed authentication attempts

### 4. **Regular Security Updates**
- Keep dependencies updated
- Monitor security advisories
- Review logs regularly for new threats

## 📞 Incident Response

If you see security alerts:

1. **Check logs** for the full scope of attacks
2. **Add suspicious IPs** to the blocked list
3. **Consider temporary rate limit reduction** during attacks
4. **Review access patterns** for legitimate traffic impact
5. **Update firewall rules** if needed

The IP `194.50.16.252` that was probing your server has been automatically blocked. 