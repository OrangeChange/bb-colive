use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{Manager, Resource, Webview};
use tokio::sync::watch;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LiveRequest {
    Send {
        query: String,
        headers: HashMap<String, String>,
        body: Vec<u8>,
    },
    RoomInfo {
        #[serde(rename = "roomId")]
        room_id: u64,
        headers: HashMap<String, String>,
    },
}

#[derive(Debug, Serialize)]
pub struct LiveResponse {
    status: u16,
    body: String,
    #[serde(rename = "headersMs")]
    headers_ms: f64,
    #[serde(rename = "bodyMs")]
    body_ms: f64,
    #[serde(rename = "localPort")]
    local_port: Option<u16>,
}

struct PendingRequest {
    request: Mutex<Option<reqwest::RequestBuilder>>,
    cancel: watch::Sender<bool>,
}

impl PendingRequest {
    fn new(request: reqwest::RequestBuilder) -> Self {
        Self {
            request: Mutex::new(Some(request)),
            cancel: watch::channel(false).0,
        }
    }

    async fn execute(&self) -> Result<LiveResponse, String> {
        let mut cancelled = self.cancel.subscribe();
        if *cancelled.borrow() {
            return Err("cancelled".into());
        }
        let request = self
            .request
            .lock()
            .unwrap()
            .take()
            .ok_or("request unavailable")?;
        let work = async {
            let started = std::time::Instant::now();
            let response = request.send().await.map_err(|_| "network request failed")?;
            let headers_ms = started.elapsed().as_secs_f64() * 1000.0;
            let local_port = response
                .extensions()
                .get::<hyper_util::client::legacy::connect::HttpInfo>()
                .map(|info| info.local_addr().port());
            let body_started = std::time::Instant::now();
            let status = response.status().as_u16();
            let body = response.text().await.map_err(|_| "response read failed")?;
            Ok(LiveResponse {
                status,
                body,
                headers_ms,
                body_ms: body_started.elapsed().as_secs_f64() * 1000.0,
                local_port,
            })
        };
        tokio::select! {
            biased;
            _ = cancelled.changed() => Err("cancelled".into()),
            result = tokio::time::timeout(Duration::from_secs(15), work) =>
                result.map_err(|_| "request timed out".to_string())?,
        }
    }
}

impl Resource for PendingRequest {
    fn close(self: Arc<Self>) {
        self.cancel.send_replace(true);
    }
}

#[tauri::command]
pub fn prepare_live_http(webview: Webview, request: LiveRequest) -> u32 {
    let client = crate::http_client::shared_http_client();
    let (request, headers) = match request {
        LiveRequest::Send { query, headers, body } =>
            (client.post(format!("https://api.live.bilibili.com/msg/send?{query}")).body(body), headers),
        LiveRequest::RoomInfo { room_id, headers } =>
            (client.get(format!("https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByUser?room_id={room_id}")), headers),
    };
    let request = headers.into_iter().fold(request, |request, (name, value)| {
        request.header(name, value)
    });
    webview.resources_table().add(PendingRequest::new(request))
}

#[tauri::command]
pub async fn execute_live_http(webview: Webview, rid: u32) -> Result<LiveResponse, String> {
    let pending = webview
        .resources_table()
        .get::<PendingRequest>(rid)
        .map_err(|_| "cancelled")?;
    let result = pending.execute().await;
    let _ = webview.resources_table().take::<PendingRequest>(rid);
    result
}

#[tauri::command]
pub fn cancel_live_http(webview: Webview, rid: u32) {
    if let Ok(pending) = webview.resources_table().take::<PendingRequest>(rid) {
        pending.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn response_identifies_reused_and_replaced_connections() {
        use axum::{extract::ConnectInfo, routing::get, Router};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let router = Router::new().route(
                "/",
                get(
                    |ConnectInfo(peer): ConnectInfo<std::net::SocketAddr>| async move {
                        peer.port().to_string()
                    },
                ),
            );
            axum::serve(
                listener,
                router.into_make_service_with_connect_info::<std::net::SocketAddr>(),
            )
            .await
            .unwrap();
        });
        let client = reqwest::Client::builder()
            .pool_idle_timeout(Duration::from_millis(50))
            .build()
            .unwrap();
        let url = format!("http://{address}/");
        let first = PendingRequest::new(client.get(&url))
            .execute()
            .await
            .unwrap();
        let second = PendingRequest::new(client.get(&url))
            .execute()
            .await
            .unwrap();
        assert_eq!(first.local_port, Some(first.body.parse::<u16>().unwrap()));
        assert_eq!(first.local_port, second.local_port);
        tokio::time::sleep(Duration::from_millis(120)).await;
        let third = PendingRequest::new(client.get(&url))
            .execute()
            .await
            .unwrap();
        assert_eq!(third.local_port, Some(third.body.parse::<u16>().unwrap()));
        assert_ne!(first.local_port, third.local_port);
        server.abort();
    }

    #[tokio::test]
    async fn cancelled_request_does_not_connect() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let request = PendingRequest::new(
            crate::http_client::shared_http_client()
                .get(format!("http://{}/", listener.local_addr().unwrap())),
        );
        request.cancel.send_replace(true);
        assert_eq!(request.execute().await.unwrap_err(), "cancelled");
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(50), listener.accept())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn completed_requests_reuse_connection_and_cancel_slow_response() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            for _ in 0..2 {
                let mut bytes = vec![0; 4096];
                let n = socket.read(&mut bytes).await.unwrap();
                assert!(n > 0);
                socket
                    .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n")
                    .await
                    .unwrap();
                tokio::time::sleep(std::time::Duration::from_millis(30)).await;
                socket.write_all(b"{}").await.unwrap();
            }
            let mut bytes = [0; 4096];
            assert!(socket.read(&mut bytes).await.unwrap() > 0);
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        });
        let client = crate::http_client::shared_http_client();
        let url = format!("http://{address}/");
        let response = PendingRequest::new(client.get(&url))
            .execute()
            .await
            .unwrap();
        assert_eq!(response.body, "{}");
        assert!(response.headers_ms.is_finite() && response.headers_ms >= 0.0);
        assert!(response.body_ms >= 20.0, "应独立记录响应内容的读取等待");
        assert_eq!(
            PendingRequest::new(client.post(&url).body("hello"))
                .execute()
                .await
                .unwrap()
                .status,
            200
        );
        let request = std::sync::Arc::new(PendingRequest::new(client.get(&url)));
        let pending = request.clone();
        let task = tokio::spawn(async move { pending.execute().await });
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        request.cancel.send_replace(true);
        assert_eq!(
            tokio::time::timeout(std::time::Duration::from_millis(100), task)
                .await
                .unwrap()
                .unwrap()
                .unwrap_err(),
            "cancelled"
        );
        server.abort();
    }
}
