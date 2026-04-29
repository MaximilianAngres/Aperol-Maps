/**
 * REAL-TIME COLLABORATION & SESSION MANAGEMENT
 * 
 * This module manages collaborative group sessions for restaurant picking.
 * It leverages WebSockets for real-time synchronization and memory-efficient 
 * state management for concurrent user interactions.
 * 
 * Features:
 * - WebSocket Orchestration: Live updates of participant state and votes.
 * - Session State Management: Centralized tracking of group decisions.
 * - Collaborative Filtering: Shared interface for group-based venue selection.
 */
use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade, Path, Query,
    },
    response::IntoResponse,
    Json,
};
use bson::doc;
use futures::{stream::StreamExt, SinkExt};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use uuid::Uuid;
use std::env;

use crate::{AppState, Claims};

// --- Data Structures ---

/// A participant in a shared session.
#[derive(Debug, Serialize, Clone)]
pub struct Participant {
    email: String,
    color: String,
}

/// A search term contributed by a participant.
#[derive(Debug, Serialize, Clone)]
pub struct SearchTerm {
    term: String,
    participant_email: String,
}

/// Thread-safe state for a collaborative search session.
#[derive(Clone, Debug, Serialize)]
pub struct SessionState {
    pub participants: Vec<Participant>,
    pub search_terms: Vec<SearchTerm>,
    /// Broadcast channel used to propagate state changes to all connected clients.
    #[serde(skip)]
    pub tx: broadcast::Sender<String>,
}

impl SessionState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(100);
        Self {
            participants: Vec::new(),
            search_terms: Vec::new(),
            tx,
        }
    }
}

/// Possible actions sent by a client over a WebSocket connection.
#[derive(Deserialize)]
#[serde(tag = "action")]
enum ClientAction {
    #[serde(rename = "add")]
    Add { term: String },

    #[serde(rename = "remove")]
    Remove { term: String },
}

// --- WebSocket Handlers ---

/// Initializes a new collaborative session and returns unique IDs and join codes.
pub async fn create_session_handler(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    let session_id = Uuid::new_v4().to_string();
    let short_code = &session_id[..5];

    state.sessions.insert(session_id.clone(), SessionState::new());
    state.short_code_map.insert(short_code.to_string(), session_id.clone());

    Json(serde_json::json!({ "session_id": session_id, "short_code": short_code }))
}

#[derive(Deserialize)]
pub struct WsToken {
    token: String,
}

/// Authenticates and upgrades a client connection to a WebSocket for session participation.
pub async fn session_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Query(query): Query<WsToken>,
) -> impl IntoResponse {
    // Resolve session ID from potentially a short code
    let full_session_id: Option<String>;

    if state.sessions.contains_key(&session_id) {
        full_session_id = Some(session_id);
    } else {
        full_session_id = state
            .short_code_map
            .get(&session_id)
            .map(|full_id_ref| full_id_ref.value().clone());
    }

    let secret = env::var("JWT_SECRET").expect("JWT_SECRET must be set");
    let decoding_key = DecodingKey::from_secret(secret.as_ref());
    let validation = Validation::default();

    // Verify JWT before allowing the upgrade
    if let Ok(token_data) = decode::<Claims>(&query.token, &decoding_key, &validation) {
        let user_email = token_data.claims.email;

        if let Some(id) = full_session_id {
            if state.sessions.contains_key(&id) {
                ws.on_upgrade(move |socket| handle_socket(socket, state, id, user_email))
            } else {
                axum::http::StatusCode::NOT_FOUND.into_response()
            }
        } else {
            axum::http::StatusCode::NOT_FOUND.into_response()
        }
    } else {
        axum::http::StatusCode::UNAUTHORIZED.into_response()
    }
}

/// Assigns a deterministic color to a participant for UI differentiation.
fn get_next_color(num_participants: usize) -> String {
    let colors = [
        "#EF4444", "#3B82F6", "#22C55E", "#EAB308",
        "#A855F7", "#EC4899", "#6366F1", "#14B8A6",
    ];
    colors[num_participants % colors.len()].to_string()
}

/// Manages the full lifecycle of a WebSocket connection.
async fn handle_socket(socket: WebSocket, state: AppState, session_id: String, user_email: String) {

    let (mut sender, mut receiver) = socket.split();

    // Join the session and broadcast participation
    let session_state_json = {
        let mut session = state.sessions.get_mut(&session_id).unwrap();
        if !session.participants.iter().any(|p| p.email == user_email) {
            let color = get_next_color(session.participants.len());
            let new_participant = Participant { email: user_email.clone(), color };
            session.participants.push(new_participant.clone());

            let join_notification = serde_json::json!({
                "type": "user_joined",
                "participant": new_participant
            });
            let _ = session.tx.send(serde_json::to_string(&join_notification).unwrap());
        }

        // Send current session state to the new participant
        let full_state_notification = serde_json::json!({
            "type": "session_state",
            "participants": session.participants,
            "search_terms": session.search_terms
        });
        serde_json::to_string(&full_state_notification).unwrap()
    };

    if sender.send(Message::Text(session_state_json.into())).await.is_err() {
        return;
    }

    let mut rx = {
        let session = state.sessions.get(&session_id).unwrap();
        session.tx.subscribe()
    };
    
    // Task to forward broadcast messages from other participants to this client
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    let state_clone = state.clone();
    let session_id_clone = session_id.clone();
    
    // Task to receive actions from this client and broadcast them to others
    let mut recv_task = tokio::spawn(async move {
        let user_email = user_email; 

        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            if let Ok(action) = serde_json::from_str::<ClientAction>(&text) {
                let mut session = state_clone.sessions.get_mut(&session_id_clone).unwrap();
                
                match action {
                    ClientAction::Add { term } => {
                        if !session.search_terms.iter().any(|st| st.term == term) {
                            let search_term = SearchTerm { term: term.clone(), participant_email: user_email.clone() };
                            session.search_terms.push(search_term.clone());
                            let notification = serde_json::json!({
                                "type": "term_added",
                                "search_term": search_term
                            });
                             let _ = session.tx.send(serde_json::to_string(&notification).unwrap());
                        }
                    }
                    ClientAction::Remove { term } => {
                        session.search_terms.retain(|st| st.term != term);
                        let notification = serde_json::json!({
                            "type": "term_removed",
                            "term": term
                        });
                        let _ = session.tx.send(serde_json::to_string(&notification).unwrap());
                    }
                }
            }
        }
    });

    // Wait for either task to finish (or fail) and cleanup
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}
