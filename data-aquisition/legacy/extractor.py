import os
import json
import time
import datetime
import google.genai as genai
import requests
from dotenv import load_dotenv
from collections import deque
from urllib.parse import urljoin

# --- Configuration ---
URL_FILE = 'urls.json'
NAVIGATION_PROMPT_FILE = 'navigation_prompt.txt'
EXTRACTION_PROMPT_FILE = 'prompt.txt'
PDF_EXTRACTION_PROMPT_FILE = 'pdf_extraction_prompt.txt'
OUTPUT_FILE = 'raw_output2.json'
MAX_DEPTH = 5
REQUEST_TIMEOUT = 15
LLM_DELAY_SECONDS = 5


def load_api_key():
    load_dotenv()
    if not os.getenv("GEMINI_API_KEY"):
        print("ERROR: GEMINI_API_KEY not found.")
        return False
    return True

def load_urls():
    try:
        with open(URL_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"ERROR: Input file '{URL_FILE}' not found")
        return None
    except json.JSONDecodeError:
        print(f"ERROR: Could not decode JSON from '{URL_FILE}'")
        return None

def load_prompt_template(file_path):
    try:
        with open(file_path, 'r') as f:
            return f.read()
    except FileNotFoundError:
        print(f"ERROR: Prompt file '{file_path}' not found")
        return None

def append_to_json_file(data_to_append, file_path):
    existing_data = []
    if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
        with open(file_path, 'r', encoding='utf-8') as f:
            try:
                existing_data = json.load(f)
                if not isinstance(existing_data, list):
                    print(f"[WARN] {file_path} does not contain a JSON list. Overwriting.")
                    existing_data = []
            except json.JSONDecodeError:
                print(f"[WARN] Could not decode existing JSON from {file_path}. Overwriting.")
                existing_data = []
    
    existing_data.append(data_to_append)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(existing_data, f, indent=2, ensure_ascii=False)

def fetch_content(url):
    print(f"   [HTTP] Fetching content from {url}...")
    try:
        response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        content_type = response.headers.get('Content-Type', '')
        
        if 'text/html' in content_type:
            return response.text, 'text/html'
        elif 'application/pdf' in content_type:
            return response.content, 'application/pdf'
        else:
            print(f"   [HTTP] Skipped unsupported content type '{content_type}' at {url}")
            return None, None
    except requests.RequestException as e:
        print(f"   [HTTP] Error fetching {url}: {e}")
        return None, None

def call_llm(prompt_parts, model_service):
    try:
        response = model_service.generate_content(
            model='gemini-2.0-flash-lite',
            contents=prompt_parts
        )
        response_text = response.text
        start_index = response_text.find('{')
        end_index = response_text.rfind('}')
        
        if start_index != -1 and end_index != -1:
            json_str = response_text[start_index:end_index + 1]
            return json.loads(json_str)
        else:
            print(f"   [WARN] No JSON object found in the response.")
            return None
    except json.JSONDecodeError:
        print(f"   [ERROR] Failed to decode JSON from the LLM's response.")
        return None
    except Exception as e:
        print(f"   [ERROR] An unexpected error occurred during LLM call: {e}")
        return None

def main():
    print("--- Aperol Maps Data Extractor ---")

    if not load_api_key(): return
    client = genai.Client()
    model_service = client.models

    prompts = [load_prompt_template(f) for f in [NAVIGATION_PROMPT_FILE, EXTRACTION_PROMPT_FILE, PDF_EXTRACTION_PROMPT_FILE]]
    if not all(prompts): return
    navigation_prompt_template, extraction_prompt_template, pdf_extraction_prompt_template = prompts


    user_input = input("Batch mode 1: \nSingle mode 2:").strip()

    if user_input not in ['1', '2']:
        print("Invalid input. Please enter '1' for batch mode or '2' for single mode.")
        return
    
    if user_input == '1':
        initial_urls = load_urls()
        if not initial_urls: return
    
    elif user_input == '2':
        initial_urls = []
        while True:
            url = input("Enter a URL\n").strip()
            if url:
                initial_urls.append(url)
            else:
                print("No URL entered")
                break


    total_initial_urls = len(initial_urls)
    extracted_count = 0
    queue = deque([(url, 0, url) for url in initial_urls])
    visited_urls = set()

    while queue:
        current_url, depth, original_url = queue.popleft()

        if current_url in visited_urls: continue
        visited_urls.add(current_url)
        
        queue_depth_gt_0 = len([item for item in queue if item[1] > 0])
        print("\n" + "="*80)
        print(f"Total Initial: {total_initial_urls} | Extracted: {extracted_count} | Queue: {len(queue)} (Deep Links: {queue_depth_gt_0})")
        print(f"Processing: {current_url} (Depth: {depth})")
        print("-"*80)

        if depth >= MAX_DEPTH:
            print(f"   [WARN] Max depth reached. Skipping.")
            continue

        content, content_type = fetch_content(current_url)
        if not content: continue

        if content_type == 'text/html':
            print("   [NAV] Finding menu link from HTML...")
            nav_prompt = navigation_prompt_template.replace('{url_placeholder}', current_url).replace('{html_content}', content)
            nav_response = call_llm([{'text': nav_prompt}], model_service)
            time.sleep(LLM_DELAY_SECONDS)

            if not nav_response or not nav_response.get('menu_url'):
                print(f"   [NAV] No menu URL found in HTML from {current_url}.")
                continue

            menu_url = urljoin(current_url, nav_response['menu_url'])
            is_final = nav_response.get('is_final_menu_link', False)
            
            print(f"   [NAV] Found potential menu URL: {menu_url} (Final link: {is_final})")

            if not is_final:
                print(f"   [QUEUE] Link is not final. Adding to queue.")
                queue.append((menu_url, depth + 1, original_url))
                continue
            else:
                current_url = menu_url
        
        print(f"   [EXTRACT] Final link identified. Extracting data from {current_url}...")
        final_content, final_content_type = fetch_content(current_url)
        if not final_content: continue

        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        extracted_data = None

        if final_content_type == 'application/pdf':
            print("   [EXTRACT] Processing as PDF...")
            pdf_prompt = pdf_extraction_prompt_template.replace('{url_placeholder}', current_url).replace('{timestamp_placeholder}', timestamp)
            prompt_parts = [{'text': pdf_prompt}, {'inline_data': {'mime_type': 'application/pdf', 'data': final_content}}]
            extracted_data = call_llm(prompt_parts, model_service)

        elif final_content_type == 'text/html':
            print("   [EXTRACT] Processing as HTML...")
            extract_prompt = extraction_prompt_template.replace('{url_placeholder}', current_url).replace('{timestamp_placeholder}', timestamp).replace('{html_content}', final_content)
            extracted_data = call_llm([{'text': extract_prompt}], model_service)

        if extracted_data:
            if 'source_metadata' in extracted_data:
                extracted_data['source_metadata']['initial_source_url'] = original_url
            append_to_json_file(extracted_data, OUTPUT_FILE)
            extracted_count += 1
            print(f"   [SUCCESS] Extracted and saved data for \"{extracted_data.get('name', 'Unknown Restaurant')}\".")
        else:
            print(f"   [EXTRACT] Failed to extract data from {current_url}.")
            
        time.sleep(LLM_DELAY_SECONDS)

    print("\n" + "="*80)
    print("--- Extraction Complete ---")
    print(f"Process finished. A total of {extracted_count} restaurant(s) were extracted.")
    print(f"Data is saved in '{OUTPUT_FILE}'.")
    print("="*80)

if __name__ == "__main__":
    main()