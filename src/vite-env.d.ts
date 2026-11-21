/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

/** Game version and short git commit of the build, e.g. "0.2.0+3f2a9c1" ("+local" outside Vercel). */
declare const __APP_VERSION__: string;
/** Where this build runs: 'prod' (main), 'qa' (dev branch previews) or 'dev' (local and tests). */
declare const __APP_ENV__: 'prod' | 'qa' | 'dev';
