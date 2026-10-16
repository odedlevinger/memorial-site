/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Minimal Google Identity Services typings (the library is loaded via a
// <script> tag in index.html, so it is not an npm dependency).
interface GoogleCredentialResponse {
  readonly credential: string;
}
interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: { theme?: string; size?: string; text?: string; width?: number },
  ): void;
}
interface Window {
  readonly google?: { accounts: { id: GoogleAccountsId } };
}
