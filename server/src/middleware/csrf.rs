use axum::{
    extract::Request,
    http::{Method, StatusCode, header},
    middleware::Next,
    response::Response,
};

// The gateway's bearer token does not exempt browser mutations from CSRF proof.
pub async fn protect(request: Request, next: Next) -> Result<Response, StatusCode> {
    let cookie = request
        .headers()
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .find_map(|v| v.trim().strip_prefix("__Host-XSRF-TOKEN="))
        .filter(|v| uuid::Uuid::parse_str(v).is_ok())
        .map(str::to_owned);
    let safe = matches!(
        *request.method(),
        Method::GET | Method::HEAD | Method::OPTIONS | Method::TRACE
    );
    if !safe
        && !cookie.as_ref().is_some_and(|value| {
            request
                .headers()
                .get("X-XSRF-TOKEN")
                .is_some_and(|header| header.as_bytes() == value.as_bytes())
        })
    {
        return Err(StatusCode::FORBIDDEN);
    }
    let mut response = next.run(request).await;
    if cookie.is_none() {
        response.headers_mut().append(
            header::SET_COOKIE,
            format!(
                "__Host-XSRF-TOKEN={}; Path=/; Secure; SameSite=Lax",
                uuid::Uuid::new_v4()
            )
            .parse()
            .expect("UUID cookie is a valid header"),
        );
    }
    Ok(response)
}
