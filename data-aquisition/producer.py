import os
import json
import time
import redis
from dotenv import load_dotenv
import glob

# --- Configuration ---
SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
WATCH_DIR = os.path.join(SCRIPT_DIR, 'incoming_urls')
SUPPORTED_EXTENSIONS = ['.txt', '.json']
CHECK_INTERVAL_SECONDS = 5
QUEUE_NAME = 'urls_to_process'
DELETE_RETRY_ATTEMPTS = 5
DELETE_RETRY_DELAY_SECONDS = 0.5

def process_file(file_path, redis_client):
    print(f"Found input file: '{file_path}'. Processing...")
    urls = []
    
    try:
        time.sleep(0.5) 
        
        file_extension = os.path.splitext(file_path)[1].lower()

        if file_extension == '.txt':
            with open(file_path, 'r', encoding='utf-8') as f:
                urls = [line.strip() for line in f if line.strip()]
        
        elif file_extension == '.json':
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list) and all(isinstance(item, str) for item in data):
                    urls = data
                else:
                    print("   [WARN] JSON file is not a simple list of strings. Skipping.")
                    return 

        if not urls:
            print("   [WARN] File is empty or contains no valid URLs. Proceeding to delete.")
        else:
            urls_pushed = 0
            for url in urls:
                job = json.dumps({"initial_url": url})
                redis_client.lpush(QUEUE_NAME, job)
                urls_pushed += 1
            print(f"   [SUCCESS] Published {urls_pushed} URLs to the '{QUEUE_NAME}' queue.")

    except json.JSONDecodeError:
        print(f"   [ERROR] Failed to decode JSON from '{file_path}'.")
    except Exception as e:
        print(f"   [ERROR] An unexpected error occurred while processing the file: {e}")
    finally:
        deleted = False
        for attempt in range(DELETE_RETRY_ATTEMPTS):
            try:
                os.remove(file_path)
                deleted = True
                print(f"   Processed and deleted '{file_path}'.")
                break
            except OSError as e:
                print(f"   [WARN] Attempt {attempt + 1}/{DELETE_RETRY_ATTEMPTS} failed to delete file: {e}")
                time.sleep(DELETE_RETRY_DELAY_SECONDS)
        
        if not deleted:
            print(f"   [ERROR] Could not delete file '{file_path}' after {DELETE_RETRY_ATTEMPTS} attempts.")


def main():
    print("--- Aperol Maps URL Producer ---")
    load_dotenv()
    REDIS_HOST = os.getenv("REDIS_HOST", "localhost")

    try:
        r = redis.Redis(host=REDIS_HOST, port=6379, db=0, decode_responses=True)
        r.ping()
        print(f"Successfully connected to Redis on {REDIS_HOST}.")
    except redis.exceptions.ConnectionError as e:
        print(f"Error connecting to Redis: {e}")
        return

    print(f"Watching for {SUPPORTED_EXTENSIONS} files in: '{WATCH_DIR}'...")

    while True:
        found_files = []
        for ext in SUPPORTED_EXTENSIONS:
            found_files.extend(glob.glob(os.path.join(WATCH_DIR, f'*{ext}')))
        
        if found_files:
            process_file(found_files[0], r)
            print(f"\nWatching for {SUPPORTED_EXTENSIONS} files in: '{WATCH_DIR}'...")

        time.sleep(CHECK_INTERVAL_SECONDS)

if __name__ == '__main__':
    if not os.path.exists(WATCH_DIR):
        print(f"Creating watch directory: {WATCH_DIR}")
        os.makedirs(WATCH_DIR)
    main()