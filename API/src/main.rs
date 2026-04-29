/**
 * API Entry Point
 * 
 * Configures the Axum server, initializes database connections (MongoDB & Redis), 
 * and defines the routing for restaurants, users, and collaborative sessions.
 */
use axum::{
    extract::DefaultBodyLimit,
    http::{header, Method},
    routing::{get, post, delete, patch},
    Router,
};
use mongodb::Collection;
use std::{env, net::SocketAddr, sync::Arc};
use tokio::net::TcpListener;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use dashmap::DashMap;

// Internal modules
mod auth;
mod db;
mod error;
mod handlers;
mod models;
mod session;

use crate::models::{Restaurant, User, UserList, Recommendation};
use crate::error::AppError;

/// Global application state shared across all request handlers
#[derive(Clone)]
pub struct AppState {
    pub venues_collection: Collection<Restaurant>,
    pub users_collection: Collection<User>,
    pub lists_collection: Collection<UserList>,
    pub recommendations_collection: Collection<Recommendation>,
    pub sessions: Arc<DashMap<String, session::SessionState>>,
    pub short_code_map: Arc<DashMap<String, String>>,
    pub redis_client: redis::Client,
}

#[tokio::main]
async fn main() {
    // Initialize tracing for logging and debugging
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            env::var("RUST_LOG").unwrap_or_else(|_| "info,tower_http=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration from environment variables
    let db_uri = env::var("DATABASE_URI").expect("DATABASE_URI must be set");
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://redis:6379/".into());

    // Initialize database connections
    let database = db::connect_to_database(&db_uri).await.unwrap_or_else(|e| {
        tracing::error!("Failed to connect to the database: {}", e);
        std::process::exit(1);
    });

    let venues_collection = database.collection("Venues");
    let users_collection = database.collection("Users");
    let lists_collection = database.collection("Lists");
    let recommendations_collection = database.collection("Recommendations");

    // Ensure database performance with indexes
    if let Err(e) = db::create_indexes(&venues_collection).await {
        tracing::error!("Failed to create indexes: {}", e);
        std::process::exit(1);
    }

    let redis_client = redis::Client::open(redis_url).expect("Failed to create Redis client");

    let app_state = AppState {
        venues_collection,
        users_collection,
        lists_collection,
        recommendations_collection,
        sessions: Arc::new(DashMap::new()),
        short_code_map: Arc::new(DashMap::new()),
        redis_client,
    };

    // Configure CORS for frontend access
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::PATCH, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

    // Build the API router
    let app = Router::new()
        .route("/api/health", get(handlers::health_check_handler))
        // Restaurant endpoints
        .route("/api/restaurants", get(handlers::get_restaurants).post(handlers::add_restaurant))
        .route("/api/restaurants/by-website", get(handlers::get_restaurant_by_website))
        .route("/api/restaurants/:restaurant_id/upload-menu", post(handlers::upload_menu_handler))
        .route("/api/restaurants/:restaurant_id/menu", patch(handlers::update_restaurant_menu_handler))
        .route("/api/restaurants/:id/recommendations", post(handlers::add_recommendation).get(handlers::get_recommendations))
        // User & Auth endpoints
        .route("/api/auth/register", post(handlers::register_user))
        .route("/api/auth/login", post(handlers::login_user))
        .route("/api/users/me", get(handlers::get_current_user))
        // User Lists endpoints
        .route("/api/lists", post(handlers::create_list).get(handlers::get_user_lists))
        .route("/api/lists/:list_id", delete(handlers::delete_list))
        .route("/api/lists/:list_id/venues", post(handlers::add_venue_to_list))
        .route("/api/lists/:list_id/venues/:venue_id", delete(handlers::remove_venue_from_list))
        // Shared Session endpoints (Real-time)
        .route("/api/sessions", post(session::create_session_handler))
        .route("/ws/sessions/:session_id", get(session::session_handler))
        // External data processing
        .route("/api/urls", post(handlers::add_urls_handler))
        // Layers
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    // Start the server
    let addr = SocketAddr::from(([0, 0, 0, 0], 8000));
    tracing::info!("Server listening on {}", addr);
    let listener = TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app.into_make_service())
        .await
        .unwrap();
}

/// Helper module for ObjectId serialization/deserialization logic
pub mod object_id_serde {
    pub use crate::db::object_id_serde::*;
}
