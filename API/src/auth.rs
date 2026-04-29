/**
 * Authentication Middleware
 * 
 * Defines the JWT logic and Axum extractors used to protect routes and 
 * identify the logged-in user.
 */
use axum::{
    extract::FromRequestParts,
    http::request::Parts,
};
use bson::oid::ObjectId;
use jsonwebtoken::{decode, Validation, DecodingKey};
use serde::{Deserialize, Serialize};
use std::env;
use crate::error::AppError;

/// JWT Claims structure representing the data encoded within the token.
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    /// Subject (User ID)
    pub sub: String,
    /// User email address
    pub email: String,
    /// Expiration timestamp
    pub exp: usize,
}

/// A wrapper around ObjectId to facilitate type-safe user identification 
/// across the application via Axum's FromRequestParts extractor.
pub struct UserId(pub ObjectId);

impl<S> FromRequestParts<S> for UserId
where
    S: Send + Sync,
{
    type Rejection = AppError;

    /// Extractor implementation that validates the Bearer token in the Authorization header.
    /// If valid, it returns the encapsulated UserId; otherwise, it returns an AppError.
    async fn from_request_parts(
        parts: &mut Parts,
        _state: &S,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts.headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|header| header.to_str().ok())
            .ok_or_else(|| AppError::from_str("Missing or invalid Authorization header"))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::from_str("Invalid token format"))?;
        
        let jwt_secret = env::var("JWT_SECRET").expect("JWT_SECRET must be set");
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(jwt_secret.as_ref()),
            &Validation::default(),
        )?;

        let user_id = ObjectId::parse_str(&token_data.claims.sub)
            .map_err(|_| AppError::from_str("Invalid user ID in token"))?;

        Ok(UserId(user_id))
    }
}
