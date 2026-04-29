"""
Aperol Maps Data Uploader
-------------------------
This worker is the final stage of the ingestion pipeline. It transforms 
cleaned restaurant records into the format expected by the backend API and 
performs the final HTTP POST request to persist the data.
"""

import json
import requests
import time
import os
import redis
from dotenv import load_dotenv

# --- Configuration ---
API_ENDPOINT = 'http://host.docker.internal:8000/api/restaurants'
API_TIMEOUT = 20 

load_dotenv()
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
INPUT_QUEUE = 'cleaned_restaurants_queue'

def transform_record(record):    
    """
    Transforms the internal crawler format into the structured schema 
    required by the Aperol Maps API.
    """
    source_metadata = record.get('source_metadata', {})

    # --- Menu Transformation ---
    transformed_menu = []
    if record.get('menu') and isinstance(record['menu'], list):
        for item in record['menu']:
            price = item.get('price')
            # Ensure price is a valid float
            if not isinstance(price, (int, float)):
                price = 0.0

            transformed_menu.append({
                'name': item.get('name', 'Unknown Item'),
                'price': price,
                'description': item.get('description') or '',
                'category': item.get('category', 'Uncategorized')
            })

    # --- Coordinates Transformation ---
    coordinates = [0.0, 0.0]
    location = record.get('location')
    if location and isinstance(location.get('coordinates'), list) and len(location['coordinates']) == 2:
        # Only use coordinates if they are non-zero (placeholder check)
        if location['coordinates'][0] != 0.0 or location['coordinates'][1] != 0.0:
            coordinates = location['coordinates']

    # --- Data Extraction from source_metadata ---
    social_media_links = source_metadata.get('social_media_links') if isinstance(source_metadata.get('social_media_links'), dict) else {}
    opening_hours = source_metadata.get('opening_hours') if isinstance(source_metadata.get('opening_hours'), dict) else {}
    website = source_metadata.get('initial_source_url', '')

    transformed_record = {
        'name': record.get('name', 'Unknown Restaurant'),
        'address': record.get('address', ''),
        'website': website,
        'coordinates': coordinates,
        'menu': transformed_menu,
        'social_media_links': social_media_links,
        'opening_hours': opening_hours
    }

    return transformed_record

def upload_record(record):
    """Performs the HTTP POST request to the backend API."""
    if not record.get('name'):
        print("   [SKIP] Record is missing a name. Not uploading.")
        return False

    restaurant_name = record.get('name')
    print(f"   [HTTP] Uploading '{restaurant_name}'...")

    try:
        response = requests.post(API_ENDPOINT, json=record, timeout=API_TIMEOUT)

        if response.status_code in [200, 201]:
            status_message = "updated" if response.status_code == 200 else "created"
            print(f"   [SUCCESS] '{restaurant_name}' {status_message} successfully.")
            return True
        else:
            print(f"   [ERROR] API returned {response.status_code}: {response.text}")
            return False

    except requests.Timeout:
        print(f"   [ERROR] API timeout.")
        return False
    except requests.RequestException as e:
        print(f"   [ERROR] Connection error: {e}")
        return False

def main():
    """Main worker loop."""
    print("--- Aperol Maps Uploader Worker ---")

    try:
        r = redis.Redis(host=REDIS_HOST, port=6379, db=0, decode_responses=True)
        r.ping()
        print(f"Successfully connected to Redis on {REDIS_HOST}.")
    except redis.exceptions.ConnectionError as e:
        print(f"Error connecting to Redis: {e}")
        return

    print(f"Listening for jobs on queue: '{INPUT_QUEUE}'...")
    while True:
        try:
            _, job_json = r.brpop(INPUT_QUEUE)

            try:
                cleaned_record = json.loads(job_json)
            except json.JSONDecodeError:
                print(f"[WARN] Could not decode JSON job data.")
                continue

            print(f"\n>>> Processing: '{cleaned_record.get('name', 'N/A')}'")

            transformed_record = transform_record(cleaned_record)
            upload_record(transformed_record)


        except redis.exceptions.ConnectionError as e:
            print(f"Redis connection lost: {e}. Reconnecting in 10s...")
            time.sleep(10)
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()