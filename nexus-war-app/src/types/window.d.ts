export { };

declare global {
    interface Window {
        __TAURI__?: boolean;
    }
}
