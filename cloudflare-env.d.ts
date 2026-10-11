declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}

declare namespace Cloudflare {
  interface Env { SETUP_TOKEN?: string; DEMO_PASSWORD?: string; DEMO_READER_TOKEN?: string; }
}
