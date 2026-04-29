"""
Aperol Maps Menu Update Processor
---------------------------------
This worker handles asynchronous menu updates triggered by users uploading 
images of physical menus. 

It uses Gemini's multimodal capabilities to extract structured menu data 
(items, prices, descriptions) and opening hours from images, then updates 
the backend API.
"""

import os
import json
import time
import requests
import redis
import google.genai as genai
from dotenv import load_dotenv

# --- Configuration ---
IMAGE_EXTRACTION_PROMPT_FILE = 'prompts/image_extraction_prompt.txt'
EXTRACTION_LLM_MODEL_NAME = 'gemini-2.5-flash'
API_BASE_URL = 'http://api:8000/api'
REQUEST_TIMEOUT = 30

load_dotenv()
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
UPDATE_QUEUE = 'menu_update_queue'

def load_prompt_template(file_path):
    """Loads prompt templates for image analysis."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        print(f"ERROR: Prompt file '{file_path}' not found")
        return None

def call_llm_for_image_extraction(client, image_data_base64, mime_type, prompt, model_name):
    """
    Sends a base64 encoded image to the Gemini API for structured data extraction.
    """
    try:
        print(f"   [LLM] Analyzing menu image via {model_name}...")

        prompt_parts = [
            prompt,
            {'inline_data': {'mime_type': mime_type, 'data': image_data_base64}}
        ]

        response = client.models.generate_content(
            model=model_name,
            contents=prompt_parts
        )

        response_text = response.text
        if response_text.startswith("```json"):
            response_text = response_text[7:-4]

        return json.loads(response_text.strip())

    except json.JSONDecodeError as e:
        print(f"   [ERROR] Failed to decode JSON response: {e}")
        return None
    except Exception as e:
        print(f"   [ERROR] LLM call failed: {e}")
        return None

def update_restaurant_data(restaurant_id, extracted_data):
    """
    Synchronizes the extracted menu and opening hours with the primary database 
    via a PATCH request to the API.
    """
    update_payload = {
        "menu": extracted_data.get("menu", []),
        "opening_hours": extracted_data.get("opening_hours", {})
    }

    # Clean up empty opening hours
    if update_payload.get("opening_hours"):
        update_payload["opening_hours"] = {
            k: v for k, v in update_payload["opening_hours"].items() if v is not None
        }

    if not update_payload.get("menu"):
        print("   [API] No menu items extracted. Skipping update.")
        return False

    update_url = f"{API_BASE_URL}/restaurants/{restaurant_id}/menu"
    print(f"   [API] Syncing data for restaurant {restaurant_id}...")

    try:
        response = requests.patch(update_url, json=update_payload, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        print(f"   [API] Successfully updated restaurant {restaurant_id}.")
        return True
    except requests.RequestException as e:
        print(f"   [API] Error during sync: {e}")
        return False

def main():
    """Main worker loop."""
    print("--- Aperol Maps Menu Update Processor ---")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: GEMINI_API_KEY not found in environment.")
        return

    client = genai.Client(api_key=api_key)

    prompt = load_prompt_template(IMAGE_EXTRACTION_PROMPT_FILE)
    if not prompt:
        print("ERROR: Missing prompt template. Exiting.")
        return

    try:
        r = redis.Redis(host=REDIS_HOST, port=6379, db=0, decode_responses=True)
        r.ping()
        print(f"Successfully connected to Redis on {REDIS_HOST}.")
    except redis.exceptions.ConnectionError as e:
        print(f"Error connecting to Redis: {e}")
        return

    print(f"Listening for jobs on queue: '{UPDATE_QUEUE}'...")
    while True:
        try:
            _, job_json = r.brpop(UPDATE_QUEUE)
            job_data = json.loads(job_json)

            restaurant_id = job_data.get("restaurant_id")
            image_base64 = job_data.get("image_bytes")
            mime_type = job_data.get("mime_type")

            if not all([restaurant_id, image_base64, mime_type]):
                print("[WARN] Received incomplete job data. Skipping.")
                continue

            print(f">>> Processing menu update for ID: {restaurant_id}")

            extracted_data = call_llm_for_image_extraction(
                client, image_base64, mime_type, prompt, EXTRACTION_LLM_MODEL_NAME
            )

            if extracted_data:
                update_restaurant_data(restaurant_id, extracted_data)

        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()