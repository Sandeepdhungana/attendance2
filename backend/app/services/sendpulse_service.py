import requests
import logging
from app.config import SENDPULSE_API_URL, SENDPULSE_CLIENT_ID, SENDPULSE_CLIENT_SECRET

logger = logging.getLogger(__name__)


def get_sendpulse_token():
    """Obtain a SendPulse API access token."""
    url = f"{SENDPULSE_API_URL}/oauth/access_token"
    payload = {
        "grant_type": "client_credentials",
        "client_id": SENDPULSE_CLIENT_ID,
        "client_secret": SENDPULSE_CLIENT_SECRET
    }
    headers = {"Content-Type": "application/json"}
    response = requests.post(url, json=payload, headers=headers)
    if response.status_code == 200:
        token = response.json().get("access_token")
        logger.info("endPulse API token retrieved successfully")
        return token
    else:
        logger.error(
            f"Failed to get SendPulse API token: {response.status_code} - {response.text}")
        return None


def send_message_by_phone(bot_id=None, phone=None, message_text=None):
    """Send a message via WhatsApp using SendPulse API, including both text and images."""
    return
    token = get_sendpulse_token()
    bot_id = "67ff97f2dccc60523807cffd"
    if not token:
        logger.error("Could not send message: No API token")
        return False

    url = f"{SENDPULSE_API_URL}/whatsapp/contacts/sendByPhone"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # 1) Send text message first
    text_payload = {
        "bot_id": bot_id,
        "phone": "971524472456",
        "message": {
            "type": "text",
            "text": {
                "body": message_text
            }
        }
    }

    logger.info(f"Sending text message to {phone}: {message_text}")
    response = requests.post(url, json=text_payload, headers=headers)
    logger.info(
        f"SendPulse Response (Text): {response.status_code} - {response.text}")
