/**
 * DATA MODELS & SCHEMA DEFINITIONS
 * 
 * Centralized source of truth for all data structures in the system.
 * This file defines the MongoDB document schemas and API payload structures,
 * ensuring type safety across the entire Rust backend.
 * 
 * Key entities:
 * - Restaurant: Comprehensive venue data including menus and social links.
 * - User: Account data with secure password storage.
 * - UserList: Customizable collections of venues.
 * - Recommendation: User-generated feedback and ratings.
 */
use serde::{Deserialize, Serialize};
use mongodb::bson::{oid::ObjectId, self};
use std::collections::HashMap;
use crate::object_id_serde;

/// Represents a restaurant or hospitality venue.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Restaurant {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none", with = "object_id_serde")]
    #[serde(default)]
    pub id: Option<ObjectId>,
    pub name: String,
    pub address: Option<String>,
    pub website: Option<String>,
    /// [Longitude, Latitude]
    pub coordinates: [f64; 2],
    pub menu: Vec<MenuItem>,
    #[serde(default)]
    pub social_media_links: HashMap<String, Option<String>>,
    #[serde(default)]
    pub opening_hours: HashMap<String, Option<String>>,
    #[serde(rename = "createdAt", skip_serializing_if = "Option::is_none")]
    pub created_at: Option<bson::DateTime>,
    #[serde(rename = "lastEditedAt", skip_serializing_if = "Option::is_none")]
    pub last_edited_at: Option<bson::DateTime>,
}

/// A specific item available on a restaurant's menu.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MenuItem {
    pub name: String,
    pub price: f64,
    pub description: String,
}

/// Represents a registered system user.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct User {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none", with = "object_id_serde")]
    #[serde(default)]
    pub id: Option<ObjectId>,
    pub email: String,
    /// Salted and hashed password.
    pub password_hash: String,
}

/// A single entry in a user-defined list, referencing a specific venue.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ListItem {
    #[serde(with = "object_id_serde")]
    pub venue_id: Option<ObjectId>,
    pub added_at: bson::DateTime,
    pub notes: Option<String>,
}

/// A collection of venues curated by a user.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UserList {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none", with = "object_id_serde")]
    #[serde(default)]
    pub id: Option<ObjectId>,
    pub user_id: Option<ObjectId>,
    pub name: String,
    pub description: Option<String>,
    pub created_at: bson::DateTime,
    pub venues: Vec<ListItem>,
}

/// A user recommendation (up/down/neutral rating) for a venue.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Recommendation {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none", with = "object_id_serde")]
    #[serde(default)]
    pub id: Option<ObjectId>,
    pub venue_id: Option<ObjectId>,
    pub user_id: Option<ObjectId>,
    pub rating: String,
    pub comment: Option<String>,
    pub created_at: bson::DateTime,
}

/// Schema for a menu update task queued in Redis.
#[derive(Serialize)]
pub struct MenuUpdateJob {
    pub restaurant_id: String,
    /// Base64 encoded menu image.
    pub image_bytes: String,
    pub mime_type: String,
}

/// Payload received from the update_processor after LLM extraction.
#[derive(Deserialize, Debug)]
pub struct UpdateMenuPayload {
    pub menu: Vec<MenuItem>,
    pub opening_hours: HashMap<String, Option<String>>,
}
