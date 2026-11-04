use crate::{
    controllers, key_vault,
    middleware::{
        auth::{self, Auth},
        csrf,
    },
    services::backup::BackupService,
    settings::Settings,
};
use async_trait::async_trait;
use axum::{Extension, Router, middleware};
use loco_rs::{
    Result,
    app::{AppContext, Hooks},
    bgworker::Queue,
    boot::{self, BootResult, StartMode},
    config::Config,
    controller::{AppRoutes, Routes},
    environment::Environment,
    task::Tasks,
};

pub struct App;
#[async_trait]
impl Hooks for App {
    fn app_name() -> &'static str {
        env!("CARGO_PKG_NAME")
    }
    fn app_version() -> String {
        env!("CARGO_PKG_VERSION").into()
    }
    async fn load_config(environment: &Environment) -> Result<Config> {
        let mut config = environment.load()?;
        let mut settings: Settings = config.settings()?;
        if *environment == Environment::Production {
            key_vault::configure(&mut settings)
                .await
                .map_err(|e| loco_rs::Error::Any(e.into()))?;
        } else {
            let contents = tokio::fs::read_to_string(&settings.databases_path)
                .await
                .map_err(loco_rs::Error::wrap)?;
            settings.databases = serde_json::from_str(&contents).map_err(loco_rs::Error::wrap)?;
        }
        settings
            .validate()
            .map_err(|e| loco_rs::Error::Any(e.into()))?;
        config.settings = Some(serde_json::to_value(settings).map_err(loco_rs::Error::wrap)?);
        Ok(config)
    }
    async fn boot(
        mode: StartMode,
        environment: &Environment,
        config: Config,
    ) -> Result<BootResult> {
        boot::create_app::<Self>(mode, environment, config).await
    }
    fn routes(_ctx: &AppContext) -> AppRoutes {
        AppRoutes::empty()
            .add_route(controllers::routes())
            .add_route(Routes::new().get("/healthz", || async { "OK" }))
    }
    async fn after_routes(router: Router, ctx: &AppContext) -> Result<Router> {
        let settings: Settings = ctx.config.settings()?;
        let auth = Auth::new(settings.oidc.issuer.clone(), settings.oidc.audience.clone())
            .await
            .map_err(|e| loco_rs::Error::Any(e.into()))?;
        let service = BackupService::new(&settings).map_err(|e| loco_rs::Error::Any(e.into()))?;
        let weak_service = std::sync::Arc::downgrade(&service);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                let Some(service) = weak_service.upgrade() else {
                    break;
                };
                service.tokens.lock().await.cleanup();
            }
        });
        if settings.schedule_enabled {
            let service = service.clone();
            tokio::spawn(async move {
                loop {
                    service.smart().await;
                    tokio::time::sleep(std::time::Duration::from_secs(86400)).await;
                }
            });
        }
        Ok(router
            .layer(Extension(service))
            .layer(middleware::from_fn_with_state(auth, auth::authorize))
            .layer(middleware::from_fn(csrf::protect)))
    }
    async fn connect_workers(_ctx: &AppContext, _queue: &Queue) -> Result<()> {
        Ok(())
    }
    fn register_tasks(_tasks: &mut Tasks) {}
}
