/**
 * CORE BUSINESS LOGIC - API HANDLERS
 * 
 * This file acts as the primary controller layer for the application.
 * It translates incoming HTTP requests from the frontend into database operations
 * and session state changes. Key responsibilities include:
 * 
 * - Restaurant Discovery: CRUD operations for venue data.
 * - User Management: Authentication, list creation, and preference tracking.
 * - Real-time Collaboration: Logic for shared sessions and voting.
 * - AI Integration: Preparing data for recommendation engines and menu processing.
 */
use axum::{
    extract::{Json, State, Query, Path},
    http::StatusCode,
};
use axum_extra::extract::Multipart;
use mongodb::{
    bson::{doc, to_bson, bson, oid::ObjectId},
    options::UpdateOptions,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{env, collections::HashMap};
use chrono::{Utc, Duration};
use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{encode, Header, EncodingKey};
use base64::{engine::general_purpose, Engine as _};
use futures::stream::StreamExt;
use redis::AsyncCommands;

use crate::{
    AppState,
    models::{Restaurant, User, UserList, Recommendation, MenuUpdateJob, UpdateMenuPayload, ListItem},
    auth::{UserId, Claims},
    error::AppError,
};

// --- Restaurant Handlers ---

/// Retrieves all restaurant records from the database.
pub async fn get_restaurants(
    State(state): State<AppState>,
) -> Result<Json<Vec<Restaurant>>, AppError> {
    let mut cursor = state.venues_collection.find(doc! {}).await?;
    let mut restaurants = Vec::new();
    while let Some(result) = cursor.next().await {
        restaurants.push(result?);
    }
    Ok(Json(restaurants))
}

/// Fetches a single restaurant record based on its website URL.
pub async fn get_restaurant_by_website(
    State(state): State<AppState>,
    Query(query): Query<WebsiteQuery>,
) -> Result<Json<Restaurant>, AppError> {
    let filter = doc! { "website": query.url };
    state
        .venues_collection
        .find_one(filter)
        .await?
        .ok_or(AppError::NotFound)
        .map(Json)
}

#[derive(Deserialize)]
pub struct WebsiteQuery {
    pub url: String,
}

/// Adds or updates a restaurant record.
/// Implementation uses an upsert strategy based on website, coordinates, or address
/// to maintain data integrity across multiple ingestion sources.
pub async fn add_restaurant(
    State(state): State<AppState>,
    Json(restaurant_data): Json<Restaurant>,
) -> Result<(StatusCode, Json<Restaurant>), AppError> {
    let is_valid_address = restaurant_data.address.as_deref().map_or(false, |s| !s.is_empty());
    let is_valid_coords = restaurant_data.coordinates != [0.0, 0.0];
    
    if !is_valid_address && !is_valid_coords {
        return Err(AppError::Custom("Cannot upsert: Restaurant must have either valid coordinates or an address.".to_string()));
    }

    // Determine the unique identity of the restaurant for upsert logic
    let filter;
    let is_valid_website = restaurant_data.website.as_deref().map_or(false, |s| !s.is_empty());

    if is_valid_website {
        filter = doc! { "website": &restaurant_data.website };
    } else if is_valid_coords {
        filter = doc! {
            "name": &restaurant_data.name,
            "coordinates": to_bson(&restaurant_data.coordinates).unwrap(),
        };
    } else {
        filter = doc! {
            "name": &restaurant_data.name,
            "address": &restaurant_data.address,
        };
    }

    let current_timestamp = bson::DateTime::from_chrono(Utc::now());

    let update = doc! {
        "$set": {
            "name": &restaurant_data.name,
            "address": restaurant_data.address.clone(),
            "website": restaurant_data.website.clone(),
            "coordinates": to_bson(&restaurant_data.coordinates).unwrap(),
            "menu": to_bson(&restaurant_data.menu).unwrap(),
            "social_media_links": to_bson(&restaurant_data.social_media_links).unwrap(),
            "opening_hours": to_bson(&restaurant_data.opening_hours).unwrap(),
            "lastEditedAt": current_timestamp,
        },
        "$setOnInsert": {
            "createdAt": current_timestamp,
        }
    };

    let options = UpdateOptions::builder().upsert(true).build();
    let result = state.venues_collection.update_one(filter, update).with_options(options).await?;

    if result.upserted_id.is_some() {
        Ok((StatusCode::CREATED, Json(restaurant_data)))
    } else {
        Ok((StatusCode::OK, Json(restaurant_data)))
    }
}

// --- Auth Handlers ---

#[derive(Deserialize)]
pub struct UserCredentials {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct TokenResponse {
    pub token: String,
}

/// Registers a new user and hashes the provided password using Bcrypt.
pub async fn register_user(
    State(state): State<AppState>,
    Json(payload): Json<UserCredentials>,
) -> Result<StatusCode, AppError> {
    let existing_user = state.users_collection.find_one(doc! { "email": &payload.email }).await?;
    if existing_user.is_some() {
        return Ok(StatusCode::CONFLICT);
    }

    let password_hash = hash(&payload.password, DEFAULT_COST)?;
    
    let new_user = User {
        id: None,
        email: payload.email,
        password_hash,
    };

    state.users_collection.insert_one(new_user).await?;
    Ok(StatusCode::CREATED)
}

/// Authenticates a user and returns a signed JWT token if credentials are valid.
pub async fn login_user(
    State(state): State<AppState>,
    Json(payload): Json<UserCredentials>,
) -> Result<Json<TokenResponse>, AppError> {
    let user = state.users_collection
        .find_one(doc! { "email": &payload.email })
        .await?
        .ok_or_else(|| AppError::from_str("Invalid credentials"))?;

    if !verify(&payload.password, &user.password_hash)? {
        return Err(AppError::from_str("Invalid credentials"));
    }

    let jwt_secret = env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    let expiration = Utc::now()
        .checked_add_signed(Duration::days(69))
        .expect("valid timestamp")
        .timestamp();

    let claims = Claims {
        sub: user.id.unwrap().to_hex(),
        email: user.email.clone(),
        exp: expiration as usize,
    };

    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(jwt_secret.as_ref()))?;

    Ok(Json(TokenResponse { token }))
}

#[derive(Serialize)]
pub struct UserProfile {
    pub id: String,
    pub email: String,
}

/// Retrieves the profile details of the currently authenticated user.
pub async fn get_current_user(
    State(state): State<AppState>,
    user_id: UserId,
) -> Result<Json<UserProfile>, AppError> {
    let filter = doc! { "_id": user_id.0 };

    let user = state
        .users_collection
        .find_one(filter)
        .await?
        .ok_or(AppError::NotFound)?;

    let user_profile = UserProfile {
        id: user.id.unwrap().to_hex(),
        email: user.email,
    };

    Ok(Json(user_profile))
}

// --- List Handlers ---

#[derive(Deserialize)]
pub struct CreateListPayload {
    pub name: String,
    pub description: Option<String>,
}

/// Creates a new custom list for the authenticated user.
pub async fn create_list(
    State(state): State<AppState>,
    user_id: UserId,
    Json(payload): Json<CreateListPayload>,
) -> Result<(StatusCode, Json<UserList>), AppError> {
    let filter = doc! {
        "user_id": user_id.0,
        "name": &payload.name,
    };
    let existing_list = state.lists_collection.find_one(filter).await?;
    if existing_list.is_some() {
        return Err(AppError::Conflict("A list with this name already exists.".to_string()));
    }

    let new_list = UserList {
        id: None,
        user_id: Some(user_id.0),
        name: payload.name,
        description: payload.description,
        created_at: bson::DateTime::from_chrono(Utc::now()),
        venues: vec![],
    };

    let result = state.lists_collection.insert_one(&new_list).await?;
    let mut final_list = new_list;
    final_list.id = result.inserted_id.as_object_id();

    Ok((StatusCode::CREATED, Json(final_list)))
}

/// Fetches all lists owned by the authenticated user.
pub async fn get_user_lists(
    State(state): State<AppState>,
    user_id: UserId,
) -> Result<Json<Vec<UserList>>, AppError> {
    let filter = doc! { "user_id": user_id.0 };
    let mut cursor = state.lists_collection.find(filter).await?;
    let mut lists = Vec::new();
    while let Some(result) = cursor.next().await {
        lists.push(result?);
    }
    Ok(Json(lists))
}

/// Deletes a specific user list.
pub async fn delete_list(
    State(state): State<AppState>,
    user_id: UserId,
    Path(list_id): Path<String>,
) -> Result<StatusCode, AppError> {
    let list_object_id = ObjectId::parse_str(&list_id).map_err(|_| AppError::from_str("Invalid list ID"))?;
    let filter = doc! { "_id": list_object_id, "user_id": user_id.0 };
    let result = state.lists_collection.delete_one(filter).await?;

    if result.deleted_count == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::NO_CONTENT)
    }
}

#[derive(Deserialize)]
pub struct AddVenuePayload {
    pub venue_id: String,
    pub notes: Option<String>,
}

/// Adds a restaurant/venue to a user's list.
pub async fn add_venue_to_list(
    State(state): State<AppState>,
    user_id: UserId,
    Path(list_id): Path<String>,
    Json(payload): Json<AddVenuePayload>,
) -> Result<StatusCode, AppError> {
    let list_object_id = ObjectId::parse_str(&list_id).map_err(|_| AppError::from_str("Invalid list ID"))?;
    let venue_object_id = ObjectId::parse_str(&payload.venue_id).map_err(|_| AppError::from_str("Invalid venue ID"))?;

    let venue_exists = state.venues_collection.find_one(doc! { "_id": venue_object_id }).await?.is_some();
    if !venue_exists {
        return Err(AppError::Custom("Venue not found".to_string()));
    }

    let list_item = ListItem {
        venue_id: Some(venue_object_id),
        added_at: bson::DateTime::from_chrono(Utc::now()),
        notes: payload.notes,
    };

    let filter = doc! { "_id": list_object_id, "user_id": user_id.0 };
    let update = doc! { "$push": { "venues": to_bson(&list_item).unwrap() } };

    let result = state.lists_collection.update_one(filter, update).await?;

    if result.matched_count == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::OK)
    }
}

/// Removes a venue from a user's list.
pub async fn remove_venue_from_list(
    State(state): State<AppState>,
    user_id: UserId,
    Path((list_id, venue_id)): Path<(String, String)>,
) -> Result<StatusCode, AppError> {
    let list_object_id = ObjectId::parse_str(&list_id).map_err(|_| AppError::from_str("Invalid list ID"))?;
    let venue_object_id = ObjectId::parse_str(&venue_id).map_err(|_| AppError::from_str("Invalid venue ID"))?;

    let filter = doc! { "_id": list_object_id, "user_id": user_id.0 };
    let update = doc! { "$pull": { "venues": { "venue_id": venue_object_id } } };

    let result = state.lists_collection.update_one(filter, update).await?;

    if result.matched_count == 0 {
        Err(AppError::NotFound)
    } else {
        Ok(StatusCode::OK)
    }
}

// --- Recommendation Handlers ---

#[derive(Deserialize)]
pub struct AddRecommendationPayload {
    pub rating: String,
    pub comment: Option<String>,
}

/// Posts a new user recommendation for a venue.
pub async fn add_recommendation(
    State(state): State<AppState>,
    user_id: UserId,
    Path(venue_id): Path<String>,
    Json(payload): Json<AddRecommendationPayload>,
) -> Result<(StatusCode, Json<Recommendation>), AppError> {
    let venue_object_id = ObjectId::parse_str(&venue_id).map_err(|_| AppError::from_str("Invalid venue ID"))?;

    let venue_exists = state.venues_collection.find_one(doc! { "_id": venue_object_id }).await?.is_some();
    if !venue_exists {
        return Err(AppError::Custom("Venue not found".to_string()));
    }

    if !["up", "down", "neutral"].contains(&payload.rating.as_str()) {
        return Err(AppError::Custom("Invalid rating. Must be 'up', 'down', or 'neutral'.".to_string()));
    }

    let new_recommendation = Recommendation {
        id: None,
        venue_id: Some(venue_object_id),
        user_id: Some(user_id.0),
        rating: payload.rating,
        comment: payload.comment,
        created_at: bson::DateTime::from_chrono(Utc::now()),
    };

    let result = state.recommendations_collection.insert_one(&new_recommendation).await?;
    let mut final_recommendation = new_recommendation;
    final_recommendation.id = result.inserted_id.as_object_id();

    Ok((StatusCode::CREATED, Json(final_recommendation)))
}

/// Retrieves all recommendations for a specific venue.
pub async fn get_recommendations(
    State(state): State<AppState>,
    Path(venue_id): Path<String>,
) -> Result<Json<Vec<Recommendation>>, AppError> {
    let venue_object_id = ObjectId::parse_str(&venue_id).map_err(|_| AppError::from_str("Invalid venue ID"))?;
    let filter = doc! { "venue_id": venue_object_id };
    let mut cursor = state.recommendations_collection.find(filter).await?;
    let mut recommendations = Vec::new();
    while let Some(result) = cursor.next().await {
        recommendations.push(result?);
    }
    Ok(Json(recommendations))
}

// --- Utility & Queue Handlers ---

#[derive(Deserialize)]
pub struct AddUrlsPayload {
    pub urls: Vec<String>,
}

/// Accepts a list of URLs and pushes them to the Redis queue for the crawler to process.
pub async fn add_urls_handler(
    State(state): State<AppState>,
    Json(payload): Json<AddUrlsPayload>,
) -> Result<StatusCode, AppError> {
    let mut conn = state.redis_client.get_multiplexed_async_connection().await?;
    let queue_name = "urls_to_process";

    for url in &payload.urls {
        let job = json!({ "initial_url": url }).to_string();
        conn.lpush::<_, _, ()>(queue_name, job).await?;
    }

    tracing::info!("Queued {} URLs for processing", payload.urls.len());
    Ok(StatusCode::ACCEPTED)
}

/// Handles multi-part form uploads of menu images, queuing them for LLM-based extraction.
pub async fn upload_menu_handler(
    State(state): State<AppState>,
    user_id: UserId,
    Path(restaurant_id): Path<String>,
    mut multipart: Multipart,
) -> Result<StatusCode, AppError> {
    let mut image_bytes: Option<Vec<u8>> = None;
    let mut mime_type: Option<String> = None;
    while let Some(field) = multipart.next_field().await? {
        if field.name() == Some("menuImage") {
            mime_type = field.content_type().map(str::to_string);
            image_bytes = Some(field.bytes().await?.to_vec());
            break;
        }
    }

    let (image_bytes, mime_type) = match (image_bytes, mime_type) {
        (Some(bytes), Some(mime)) => (bytes, mime),
        _ => return Err(AppError::Custom("menuImage field is missing or invalid.".to_string())),
    };

    let image_base64 = general_purpose::STANDARD.encode(&image_bytes);

    let job = MenuUpdateJob {
        restaurant_id,
        image_bytes: image_base64,
        mime_type,
    };

    let mut conn = state.redis_client.get_multiplexed_async_connection().await?;
    let job_json = serde_json::to_string(&job).unwrap();

    conn.lpush::<_, _, ()>("menu_update_queue", job_json).await?;

    tracing::info!("Queued menu update job for user {}", user_id.0.to_hex());
    Ok(StatusCode::ACCEPTED)
}

/// Endpoint called by the update_processor to update a restaurant's menu with extracted data.
pub async fn update_restaurant_menu_handler(
    State(state): State<AppState>,
    Path(restaurant_id): Path<String>,
    Json(payload): Json<UpdateMenuPayload>,
) -> Result<StatusCode, AppError> {
    let oid = ObjectId::parse_str(&restaurant_id)
        .map_err(|_| AppError::Custom("Invalid restaurant ID format".to_string()))?;

    let filter = doc! { "_id": oid };

    let update = doc! {
        "$set": {
            "menu": to_bson(&payload.menu).unwrap(),
            "opening_hours": to_bson(&payload.opening_hours).unwrap(),
            "lastEditedAt": bson::DateTime::from_chrono(Utc::now()),
        }
    };

    let result = state.venues_collection.update_one(filter, update).await?;

    if result.matched_count == 0 {
        return Err(AppError::NotFound);
    }
    
    tracing::info!("Successfully updated menu for restaurant {}", restaurant_id);
    Ok(StatusCode::OK)
}

/// Simple health check endpoint for monitoring.
pub async fn health_check_handler() -> StatusCode {
    StatusCode::OK
}
