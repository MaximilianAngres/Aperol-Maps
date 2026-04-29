"""
Aperol Maps Crawler Worker
--------------------------
This module implements an intelligent web crawler that uses LLMs (Gemini/Gemma) 
to navigate restaurant websites and extract structured menu and contact data.

It operates as a background worker, listening to a Redis queue for new URLs 
to process and pushing extracted data back to an output queue.
"""

import os
import json
import time
import datetime
from google import genai
import requests
import redis
from dotenv import load_dotenv
from collections import deque
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from colorama import Fore, Style, init

# --- Configuration & Environment ---
NEW_VENUES_ONLY = True
SELECTION_PROMPT_FILE = 'prompts/site_analysis_prompt.txt'
COMBINED_EXTRACTION_PROMPT_FILE = 'prompts/combined_extraction_prompt.txt'
SELECTION_LLM_MODEL_NAME = 'gemma-3-27b-it'
EXTRACTION_LLM_MODEL_NAME = 'gemini-2.5-flash'
MAX_DEPTH = 2
REQUEST_TIMEOUT = 15
API_BASE_URL = 'http://host.docker.internal:8000/api'

load_dotenv()
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
INPUT_QUEUE = 'urls_to_process'
OUTPUT_QUEUE = 'raw_restaurants_queue'

def log(level, message):
    """Provides color-coded console logging for better observability."""
    color_map = {
        "INFO": Fore.CYAN,
        "WARN": Fore.YELLOW,
        "ERROR": Fore.RED,
        "SUCCESS": Fore.GREEN,
        "HTTP": Fore.BLUE,
        "SITEMAP": Fore.MAGENTA,
        "SELECT": Fore.CYAN,
        "EXTRACT": Fore.GREEN,
        "DEBUG": Fore.WHITE
    }
    color = color_map.get(level.upper(), Fore.WHITE)
    print(f"{color}[{level.upper()}] {Style.RESET_ALL}{message}")


def load_prompt_template(file_path):
    """Loads LLM prompt templates."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        log("ERROR", f"Prompt file '{file_path}' not found")
        return None

def fetch_content(url):
    """
    Fetches raw content from a URL with basic error handling and content type filtering.
    Supports HTML, PDF, and common image formats.
    """
    log("HTTP", f"Fetching content from {url}...")
    try:
        response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        content_type = response.headers.get('Content-Type', '').lower()

        if 'text/html' in content_type:
            return response.text, 'text/html'
        elif 'application/pdf' in content_type:
            return response.content, 'application/pdf'
        elif any(img in content_type for img in ['image/jpeg', 'image/png', 'image/webp']):
            return response.content, content_type
        else:
            log("HTTP", f"Skipped unsupported content type '{content_type}' at {url}")
            return None, None
    except requests.RequestException as e:
        log("HTTP", f"Error fetching {url}: {e}")
        return None, None

def call_llm(client, prompt_parts, model_name):
    """
    Executes a prompt against the Gemini API and parses the expected JSON response.
    Includes sanitization for Markdown code blocks in LLM output.
    """
    try:
        response = client.models.generate_content(
            model=model_name,
            contents=prompt_parts
        )
        
        response_text = response.text
        # Clean up potential Markdown formatting in the response
        if response_text.startswith("```json"):
            response_text = response_text[7:-4]

        return json.loads(response_text.strip())

    except json.JSONDecodeError as e:
        log("ERROR", f"Failed to decode JSON from the response. Error: {e}")
        log("ERROR", f"Raw Response Text: {response.text}")
        return None
    except Exception as e:
        log("ERROR", f"An unexpected error occurred during LLM call: {e}")
        return None

def is_same_domain(base_url, new_url):
    """Ensures the crawler stays within the target domain."""
    return urlparse(base_url).netloc == urlparse(new_url).netloc

def build_sitemap(initial_url, max_depth):
    """
    Recursively discovers internal links to build a sitemap of the target website.
    Limited by max_depth to avoid infinite loops or massive sites.
    """
    log("SITEMAP", "Building sitemap...")
    queue = deque([(initial_url, 0)])
    visited = {initial_url}
    sitemap = {}

    while queue:
        current_url, depth = queue.popleft()

        if depth > max_depth:
            continue

        content, content_type = fetch_content(current_url)
        if content_type != 'text/html':
            continue

        soup = BeautifulSoup(content, 'lxml')
        for a_tag in soup.find_all('a', href=True):
            link_text = a_tag.get_text(strip=True)
            href = a_tag['href'].strip()

            if href.startswith(('mailto:', 'tel:', 'javascript:')):
                continue
            absolute_link = urljoin(current_url, a_tag['href'])

            parsed_link = urlparse(absolute_link)
            cleaned_link = parsed_link._replace(fragment="").geturl()

            if cleaned_link not in visited and is_same_domain(initial_url, cleaned_link):
                visited.add(cleaned_link)
                sitemap[cleaned_link] = link_text
                queue.append((cleaned_link, depth + 1))
                log("SITEMAP", f"Found link: {cleaned_link} (Text: '{link_text}')")

    log("SITEMAP", f"Sitemap build complete. Found {len(sitemap)} unique pages.")
    return sitemap

def get_intelligent_selection(client, sitemap, base_url, prompt_template):
    """
    Uses an LLM to analyze the sitemap and select the most relevant URLs for 
    menu extraction and contact information.
    """
    log("SELECT", "URL selection...")
    sitemap_str = "\n".join([f'- {url} (Link Text: "{text}")' for url, text in sitemap.items()])
    
    prompt = prompt_template.replace('{base_url}', base_url).replace('{sitemap}', sitemap_str)
    
    selection = call_llm(client, [{'text': prompt}], SELECTION_LLM_MODEL_NAME)
    
    if selection:
        log("SELECT", f"LLM selected {len(selection.get('menu_urls', []))} menu URLs and {len(selection.get('contact_urls', []))} contact URLs.")
    else:
        log("SELECT", "LLM did not return a valid selection.")
        
    return selection


def process_url(client, initial_url, prompts):
    """
    Orchestrates the full crawling and extraction process for a single restaurant URL.
    1. Build sitemap
    2. Intelligent URL selection
    3. Targeted content collection
    4. Structured data extraction via LLM
    """
    print(f"\n--- Starting processing for initial URL: {initial_url} ---")

    sitemap = build_sitemap(initial_url, MAX_DEPTH)
    if not sitemap:
        log("WARN", "Could not build a sitemap. No links found. Attempting to process initial URL directly.")
        sitemap = {initial_url: "Initial URL"}

    selection = get_intelligent_selection(client, sitemap, initial_url, prompts['select'])
    if not selection:
        log("ERROR", "Failed to get selection from LLM. Aborting job.")
        return None

    # Collect content from selected URLs
    urls_to_process = set(selection.get('menu_urls', []) + selection.get('contact_urls', []) + selection.get('about_urls', []))
    urls_to_process.add(initial_url)

    log("EXTRACT", "Starting targeted content collection...")
    combined_llm_parts = []
    prompt_template = prompts['extract']
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    initial_prompt = prompt_template.replace('{timestamp_placeholder}', timestamp).replace('{base_url}', initial_url)
    combined_llm_parts.append({'text': initial_prompt})

    for url in urls_to_process:
        log("EXTRACT", f"Collecting content from: {url}")
        content, content_type = fetch_content(url)
        if not content:
            continue

        combined_llm_parts.append({'text': f"\n--- Start of content from {url} ({content_type}) ---\n"})

        # Handle different content types for the LLM
        if content_type == 'application/pdf':
            combined_llm_parts.append({'inline_data': {'mime_type': 'application/pdf', 'data': content}})
        elif 'image/' in content_type:
            combined_llm_parts.append({'inline_data': {'mime_type': content_type, 'data': content}})
        elif content_type == 'text/html':
            soup = BeautifulSoup(content, 'lxml')
            # Strip boilerplate
            for tag in soup(['script', 'style', 'nav', 'aside']):
                tag.decompose()
            cleaned_html = soup.get_text(separator='\n', strip=True)
            combined_llm_parts.append({'text': cleaned_html})
        
        combined_llm_parts.append({'text': f"\n--- End of content from {url} ---\n"})

    if len(combined_llm_parts) <= 1:
        log("WARN", f"Could not fetch any content from the selected URLs for {initial_url}.")
        return None

    log("EXTRACT", "All content collected! Sending to LLM for final extraction...")
    extracted_data = call_llm(client, combined_llm_parts, EXTRACTION_LLM_MODEL_NAME)

    if extracted_data:
        log("SUCCESS", f"Extracted data from {initial_url}")
        if 'source_metadata' not in extracted_data:
            extracted_data['source_metadata'] = {}
        extracted_data['source_metadata']['initial_source_url'] = initial_url
        
        log("SUCCESS", f"Extraction complete for \"{extracted_data.get('name', 'Unknown Restaurant')}\".")
        return extracted_data
    else:
        log("WARN", f"Could not extract any data from {initial_url}.")
        return None


def main():
    """Main worker loop."""
    init(autoreset=True)
    print("--- Aperol Maps Crawler Worker ---")

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        log("ERROR", "GEMINI_API_KEY or GOOGLE_API_KEY not found.")
        return
    
    client = genai.Client(api_key=api_key)

    # Pre-load prompts to avoid redundant I/O
    prompts = {
        'select': load_prompt_template(SELECTION_PROMPT_FILE),
        'extract': load_prompt_template(COMBINED_EXTRACTION_PROMPT_FILE)
    }
    if not all(prompts.values()):
        log("ERROR", "Could not load all required prompt templates. Exiting.")
        return

    # Initialize Redis connection
    try:
        r = redis.Redis(host=REDIS_HOST, port=6379, db=0, decode_responses=True)
        r.ping()
        log("SUCCESS", f"Successfully connected to Redis on {REDIS_HOST}.")
    except redis.exceptions.ConnectionError as e:
        log("ERROR", f"Error connecting to Redis: {e}")
        return

    log("INFO", f"Listening for jobs on queue: '{INPUT_QUEUE}'...")
    while True:
        try:
            # Blocking pop from Redis
            _, job_json = r.brpop(INPUT_QUEUE)
            job_data = json.loads(job_json)
            initial_url = job_data.get("initial_url")

            if not initial_url:
                log("WARN", "Received job with no 'initial_url'. Skipping.")
                continue

            # Check if restaurant already exists to avoid redundant processing
            if NEW_VENUES_ONLY:
                try:
                    check_url = f"{API_BASE_URL}/restaurants/by-website?url={initial_url}"
                    response = requests.get(check_url, timeout=REQUEST_TIMEOUT)
                    if response.status_code == 200:
                        log("INFO", f"Skipping existing venue: {initial_url}")
                        continue
                except requests.RequestException as e:
                    log("ERROR", f"API check failed for {initial_url}: {e}. Proceeding.")

            log("INFO", f">>> Processing: {initial_url}")
            result = process_url(client, initial_url, prompts)

            if result:
                r.lpush(OUTPUT_QUEUE, json.dumps(result, ensure_ascii=False))
                log("SUCCESS", f"<<< Pushed data for '{result.get('name')}' to '{OUTPUT_QUEUE}'.")

        except redis.exceptions.ConnectionError as e:
            log("ERROR", f"Redis connection lost: {e}. Retrying in 10s...")
            time.sleep(10)
        except Exception as e:
            log("ERROR", f"An unexpected error occurred: {e}")
            time.sleep(5) 

if __name__ == "__main__":
    main()

if __name__ == "__main__":
    main()