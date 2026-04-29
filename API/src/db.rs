/**
 * Database Connection & Initialization
 * 
 * Handles connecting to MongoDB and ensures required indexes (like geospatial 
 * indices for restaurant locations) are created on startup.
 */
use mongodb::{
    bson::{doc, Bson, oid::ObjectId},
    options::{ClientOptions, ServerApi, ServerApiVersion, IndexOptions},
    Client, Collection, IndexModel,
};
use serde::{de, Deserializer, Serializer};
use tracing::info;
use crate::models::Restaurant;

/// Establishes a connection to the MongoDB cluster and verifies it with a ping.
pub async fn connect_to_database(db_uri: &str) -> mongodb::error::Result<mongodb::Database> {
    info!("Connecting to the database...");
    let mut client_options = ClientOptions::parse(db_uri).await?;
    let server_api = ServerApi::builder().version(ServerApiVersion::V1).build();
    client_options.server_api = Some(server_api);
    let client = Client::with_options(client_options)?;
    
    // Ping the database to verify connectivity
    client.database("admin").run_command(doc! {"ping": 1}).await?;
    info!("Database connection successful!");
    
    Ok(client.database("Datenschrank"))
}

/// Configures database indexes to ensure query performance and data uniqueness.
pub async fn create_indexes(collection: &Collection<Restaurant>) -> mongodb::error::Result<()> {
    info!("Creating database indexes...");

    // Unique index on website to prevent duplicate entries for the same URL
    let website_index_model = IndexModel::builder()
        .keys(doc! { "website": 1 })
        .options(
            IndexOptions::builder()
                .unique(true)
                .partial_filter_expression(doc! { "website": { "$gt": "" } })
                .build()
        )
        .build();

    // Composite index for name and coordinates for spatial uniqueness
    let coord_index_model = IndexModel::builder()
        .keys(doc! { "name": 1, "coordinates": 1 })
        .options(IndexOptions::builder().unique(true).build())
        .build();

    // Fallback composite index for name and address
    let addr_index_model = IndexModel::builder()
        .keys(doc! { "name": 1, "address": 1 })
        .options(
            IndexOptions::builder()
                .unique(true)
                .partial_filter_expression(doc! { "address": { "$gt": "" } })
                .build()
        )
        .build();

    collection.create_indexes(vec![website_index_model, coord_index_model, addr_index_model]).await?;
    info!("Indexes created successfully.");
    Ok(())
}

/// Serialization helper module for MongoDB's ObjectId to hex-string conversion.
pub mod object_id_serde {
    use super::*;

    pub fn serialize<S>(id: &Option<ObjectId>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match id {
            Some(oid) => serializer.serialize_str(&oid.to_hex()),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<ObjectId>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let bson = Bson::deserialize(deserializer)?;
        match bson {
            Bson::ObjectId(oid) => Ok(Some(oid)),
            Bson::String(s) if !s.is_empty() => ObjectId::parse_str(&s)
                .map(Some)
                .map_err(|e| de::Error::custom(format!("Invalid ObjectId: {}", e))),
            _ => Ok(None),
        }
    }
}
