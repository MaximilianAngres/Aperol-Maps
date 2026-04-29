/**
 * Centralized Error Handling
 * 
 * Defines the application's error types and implements Axum's IntoResponse 
 * to provide consistent, typed error messages to the frontend.
 */
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use axum_extra::extract::multipart::MultipartError;

#[derive(Debug)]
pub enum AppError {
    MongoError(mongodb::error::Error),
    BcryptError(bcrypt::BcryptError),
    RedisError(redis::RedisError),
    JwtError(jsonwebtoken::errors::Error),
    Custom(String),
    Conflict(String),
    MultipartError(MultipartError),
    NotFound,
}

impl From<redis::RedisError> for AppError {
    fn from(err: redis::RedisError) -> Self {
        AppError::RedisError(err)
    }   
}

impl From<mongodb::error::Error> for AppError {
    fn from(err: mongodb::error::Error) -> Self {
        AppError::MongoError(err)
    }
}

impl From<bcrypt::BcryptError> for AppError {
    fn from(err: bcrypt::BcryptError) -> Self {
        AppError::BcryptError(err)
    }
}

impl From<jsonwebtoken::errors::Error> for AppError {
    fn from(err: jsonwebtoken::errors::Error) -> Self {
        AppError::JwtError(err)
    }
}

impl From<MultipartError> for AppError {
    fn from(err: MultipartError) -> Self {
        AppError::MultipartError(err)
    }
}

impl AppError {
    pub fn from_str(msg: &str) -> Self {
        AppError::Custom(msg.to_string())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::MongoError(e) => {
                tracing::error!("Database Error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string())
            }
            AppError::BcryptError(e) => {
                tracing::error!("Hashing Error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal error".to_string())
            }
            AppError::RedisError(e) => {
                tracing::error!("Redis Error: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal error".to_string())
            }
            AppError::JwtError(e) => {
                tracing::error!("JWT Error: {:?}", e);
                (StatusCode::UNAUTHORIZED, "Authentication error".to_string())
            }
            AppError::Custom(msg) => {
                tracing::warn!("API Error: {}", msg);
                (StatusCode::BAD_REQUEST, msg)
            }
            AppError::MultipartError(e) => {
                tracing::error!("Multipart Form Error: {:?}", e);
                (StatusCode::BAD_REQUEST, "Invalid form data.".to_string())
            }
            AppError::Conflict(msg) => (StatusCode::CONFLICT, msg),
            AppError::NotFound => (StatusCode::NOT_FOUND, "Not found".to_string()),
        };

        (status, Json(serde_json::json!({ "error": error_message }))).into_response()
    }
}
