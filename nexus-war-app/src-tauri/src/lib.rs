use steamworks::Client;
use std::sync::Mutex;
use tauri::State;

struct SteamState(Mutex<Option<Client>>);

#[tauri::command]
fn init_steam(state: State<'_, SteamState>) -> Result<String, String> {
    // AppID 480 (Spacewar) is used for testing
    match Client::init_app(480) {
        Ok((client, single)) => {
            let name = client.friends().name();
            // Store client in state if needed later
            *state.0.lock().unwrap() = Some(client);
            
            // Run callbacks in a separate thread
            std::thread::spawn(move || {
                loop {
                    single.run_callbacks();
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
            });
            
            Ok(name)
        }
        Err(e) => Err(format!("Failed to initialize Steam: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(SteamState(Mutex::new(None)))
    .invoke_handler(tauri::generate_handler![init_steam])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
