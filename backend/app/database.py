import requests
import os
import logging
import json
import time
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from app.config import BACK4APP_APPLICATION_ID, BACK4APP_REST_API_KEY, BACK4APP_SERVER_URL, BACK4APP_MASTER_KEY

# Set up logging
logger = logging.getLogger(__name__)

# Configure retry strategy
retry_strategy = Retry(
    total=3,  # number of retries
    backoff_factor=0.5,  # wait 0.5, 1, 2 seconds between retries
    status_forcelist=[500, 502, 503, 504]  # HTTP status codes to retry on
)

# Create session with retry strategy
session = requests.Session()
adapter = HTTPAdapter(max_retries=retry_strategy)
session.mount("http://", adapter)
session.mount("https://", adapter)

# Headers for all requests
HEADERS = {
    "X-Parse-Application-Id": BACK4APP_APPLICATION_ID,
    "X-Parse-REST-API-Key": BACK4APP_REST_API_KEY,
    "X-Parse-Master-Key": BACK4APP_MASTER_KEY,
    "Content-Type": "application/json"
}

BASE_URL = f"{BACK4APP_SERVER_URL}/classes"
SCHEMA_URL = f"{BACK4APP_SERVER_URL}/schemas"

def get_db():
    """Get database connection"""
    # In Back4App, we don't need to manage connections like in SQLite
    # We use direct HTTP requests instead
    return None

def query(class_name, where=None, order=None, limit=None):
    """Query Back4App database"""
    url = f"{BASE_URL}/{class_name}"
    params = {}
    if where:
        params["where"] = json.dumps(where)
    if order:
        params["order"] = order
    if limit:
        params["limit"] = limit
    
    logger.info(f"Querying {class_name} with params: {params}")
    try:
        response = session.get(url, headers=HEADERS, params=params)
        response.raise_for_status()
        return response.json()["results"]
    except requests.exceptions.RequestException as e:
        logger.error(f"Error querying {class_name}: {str(e)}")
        if hasattr(e.response, 'text'):
            logger.error(f"Response: {e.response.text}")
        raise

def create(class_name, data):
    """Create a new record in Back4App"""
    url = f"{BASE_URL}/{class_name}"
    logger.info(f"Creating {class_name} with data: {data}")
    try:
        response = session.post(url, headers=HEADERS, json=data)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Error creating {class_name}: {str(e)}")
        if hasattr(e.response, 'text'):
            logger.error(f"Response: {e.response.text}")
        raise

def update(class_name, object_id, data):
    """Update a record in Back4App"""
    url = f"{BASE_URL}/{class_name}/{object_id}"
    logger.info(f"Updating {class_name}/{object_id} with data: {data}")
    try:
        response = session.put(url, headers=HEADERS, json=data)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Error updating {class_name}: {str(e)}")
        if hasattr(e.response, 'text'):
            logger.error(f"Response: {e.response.text}")
        raise

def delete(class_name, object_id):
    """Delete a record from Back4App"""
    url = f"{BASE_URL}/{class_name}/{object_id}"
    logger.info(f"Deleting {class_name}/{object_id}")
    try:
        response = session.delete(url, headers=HEADERS)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Error deleting {class_name}: {str(e)}")
        if hasattr(e.response, 'text'):
            logger.error(f"Response: {e.response.text}")
        raise

def create_class_schema(class_name: str, fields: dict):
    """Create a new class schema in Back4App"""
    schema = {
        "className": class_name,
        "fields": {}
    }

    # Add each field to the schema
    for field_name, field_type in fields.items():
        if field_type.startswith("Pointer<"):
            # Handle pointer fields
            target_class = field_type[8:-1]  # Extract class name from Pointer<ClassName>
            schema["fields"][field_name] = {
                "type": "Pointer",
                "targetClass": target_class
            }
        else:
            # Handle regular fields
            schema["fields"][field_name] = {
                "type": field_type
            }

    logger.info(f"Creating schema for {class_name} with schema: {json.dumps(schema, indent=2)}")
    try:
        response = session.post(
            SCHEMA_URL,
            headers=HEADERS,
            json=schema
        )
        response.raise_for_status()
        logger.info(f"Successfully created schema for {class_name}")
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Error creating schema for {class_name}: {str(e)}")
        if hasattr(e.response, 'text'):
            logger.error(f"Response: {e.response.text}")
        raise 