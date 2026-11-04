use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Resource not found")]
    NotFound,
    #[error("Invalid request")]
    BadRequest,
    #[error("Download link has expired or is invalid")]
    Gone,
    #[error("{0}")]
    Folder(String),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

pub type Result<T> = std::result::Result<T, Error>;

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            Self::NotFound => (StatusCode::NOT_FOUND, self.to_string()),
            Self::BadRequest => (StatusCode::BAD_REQUEST, self.to_string()),
            Self::Gone => (StatusCode::GONE, self.to_string()),
            Self::Folder(_) => (StatusCode::INTERNAL_SERVER_ERROR, self.to_string()),
            Self::Internal(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Backup operation failed".into(),
            ),
        };
        tracing::error!(error = %self, "Request failed");
        (status, Json(serde_json::json!({"message": message}))).into_response()
    }
}
