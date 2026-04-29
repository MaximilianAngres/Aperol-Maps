"""
Aperol Maps Data Cleaner
------------------------
This module cleans and validates extracted restaurant data before it is 
transformed and uploaded to the API.
"""

import json
import random
import os
import time
import redis
from dotenv import load_dotenv

# --- Configuration ---
# Radius in degrees (~3.3 km) used to distribute venues around Dublin center
RANDOMIZATION_RADIUS = 0.03  
DUBLIN_CENTER = (53.3498, -6.2603)

load_dotenv()
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
INPUT_QUEUE = 'raw_restaurants_queue'
OUTPUT_QUEUE = 'cleaned_restaurants_queue'

def get_random_dublin_coords():
    """Generates a random coordinate pair within the defined Dublin radius."""
    lat = DUBLIN_CENTER[0] + random.uniform(-RANDOMIZATION_RADIUS, RANDOMIZATION_RADIUS)
    lon = DUBLIN_CENTER[1] + random.uniform(-RANDOMIZATION_RADIUS, RANDOMIZATION_RADIUS)
    return [round(lon, 6), round(lat, 6)]

def clean_record(record):
    """
    Validates the integrity of a restaurant record.
    Ensures that every venue has valid geographical coordinates.
    """
    if not isinstance(record, dict):
        print(f"   [WARN] Received non-dict record: {type(record)}. Skipping.")
        return None

    location = record.get('location')
    coords = None

    if isinstance(location, dict):
        coords = location.get('coordinates')

    # If coordinates are missing or invalid, generate a placeholder near Dublin
    if not isinstance(coords, list) or len(coords) != 2 or not all(isinstance(c, (int, float)) for c in coords):
        restaurant_name = record.get('name', 'Unknown Restaurant')
        print(f"   [CLEAN] Missing/invalid coordinates for '{restaurant_name}'. Generating Dublin placeholder.")

        if not isinstance(location, dict):
            record['location'] = {}

        record['location']['coordinates'] = get_random_dublin_coords()

    return record

def main():
    """Main worker loop for the cleaner service."""
    print("--- Aperol Maps Cleaner Worker ---")

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
                raw_record = json.loads(job_json)
            except json.JSONDecodeError:
                print(f"[WARN] Could not decode JSON from job.")
                continue

            print(f"\n>>> Processing: '{raw_record.get('name', 'N/A')}'")

            cleaned_record = clean_record(raw_record)

            if cleaned_record:
                r.lpush(OUTPUT_QUEUE, json.dumps(cleaned_record, ensure_ascii=False))
                print(f"<<< Pushed cleaned data to '{OUTPUT_QUEUE}'.")

        except redis.exceptions.ConnectionError as e:
            print(f"Redis connection lost: {e}. Retrying in 10s...")
            time.sleep(10)
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()