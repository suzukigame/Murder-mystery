export { };

declare global {
    interface Window {
        __TAURI__?: boolean;
        __TAURI_INTERNALS__?: Record<string, unknown>;
    }
}
