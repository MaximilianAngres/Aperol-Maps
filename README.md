# Aperol Maps

Aperol Maps is a data-driven platform designed to aggregate and compare beverage offerings from local hospitality venues. This project was developed as a Master's thesis to address the fragmentation of menu information in the local hospitality sector. It provides a centralized, searchable interface for beverage prices and availability.

## Projektübersicht (German)

Aperol Maps ist eine datengestützte Plattform zur Aggregation und zum Vergleich von Getränkeangeboten lokaler Gastronomiebetriebe. Das Projekt wurde im Rahmen einer Masterarbeit entwickelt, um die Fragmentierung von Menüinformationen im Gastgewerbe zu adressieren. Es bietet eine zentrale, durchsuchbare Schnittstelle für Getränkepreise und deren Verfügbarkeit.

## Core Functionality

- **Location-Based Search:** Filters venues based on specific inventory, pricing, and geographic proximity.
- **Collaborative Sessions:** Synchronized search sessions via WebSockets for group coordination.
- **Automated Data Ingestion:** A multi-stage pipeline utilizing Large Language Models (LLMs) to extract structured data from semi-structured web content and menu images.
- **Geographic Visualization:** Interactive map interface for spatial data exploration.
- **User Collections:** Persistence of user-defined venue lists and recommendations.

## Technical Stack

### Frontend
- **Framework:** React (TypeScript) with Vite.
- **State Management:** Zustand for global application state.
- **Mapping:** Leaflet for spatial data rendering.
- **Styling:** Tailwind CSS and Radix UI primitives.
- **Real-time:** Native WebSocket implementation for session synchronization.

### Backend (API)
- **Language:** Rust (Axum framework).
- **Database:** MongoDB (Document storage) and Redis (Task queuing and session caching).
- **Security:** JWT-based authentication and Bcrypt password hashing.
- **Architecture:** Modular design with strict separation of concerns (Models, Handlers, Database, Error Handling).

### Data Acquisition Pipeline
- **Implementation:** Python-based workers.
- **Logic:** Custom crawling logic combined with BeautifulSoup for content extraction.
- **Inference:** Integration with Gemini and Gemma models for structured data extraction from HTML, PDF, and image formats.

## Repository Structure

This repository has been organized for clarity as a professional work sample:
- **API/:** The Rust-based backend service.
- **aperol-maps-frontend/:** The React-based user interface.
- **data-aquisition/:** The Python-based data ingestion workers.
- **archive/:** Contains legacy code, build artifacts, and theoretical research documentation not intended for production use.

## Feel free to have a look around`
