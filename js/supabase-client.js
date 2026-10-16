// The one Supabase client. URL and anon key come from config.js (public values; RLS protects the data).

const cfg = window.CC_CONFIG ?? {};

export const configured = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('TU-PROYECTO'));

export const sb = configured
  ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    // Implicit flow: a password-reset link opened in Safari works even if the app was installed from the
    // home screen (PKCE would need a code stored in that same browser).
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'cc-auth' },
    realtime: { params: { eventsPerSecond: 5 } },
  })
  : null;

export const appUrl = cfg.appUrl || new URL('./', location.href).href;

// Network trouble (retry later) vs. a real refusal from the server (tell the person, drop the change).
export function isNetworkError(error, status) {
  if (!error) return false;
  if (status === 0 || status === 408 || status === 429 || (status >= 500 && status < 600)) return true;
  const msg = `${error.message ?? ''} ${error.details ?? ''}`;
  return /fetch|network|load failed|timeout|offline|ECONN/i.test(msg) && !error.code;
}

export function isAuthError(error, status) {
  return status === 401 || error?.code === 'PGRST301' || /jwt/i.test(error?.message ?? '');
}

// Messages raised by our own SQL are already Spanish; anything else gets a plain generic sentence.
export function friendlyError(error) {
  const e = error?.supabase ?? error;
  const msg = e?.message ?? '';
  // Our SQL raises its own Spanish sentences with code P0001 (or 42501 for "No perteneces a esta casa.").
  if (e?.code === 'P0001') return msg;
  if (e?.code === '42501' && !/permission denied|row-level security/i.test(msg)) return msg;
  if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/already registered|already been registered|User already/i.test(msg)) return 'Ya hay una cuenta con ese correo. Entra con tu contraseña.';
  if (/Password should be|at least 6/i.test(msg)) return 'La contraseña tiene que tener al menos 6 caracteres.';
  if (/valid email|invalid format|Unable to validate email/i.test(msg)) return 'Ese correo no parece válido.';
  if (/rate limit|too many/i.test(msg)) return 'Demasiados intentos. Espera un momento y vuelve a probar.';
  if (isNetworkError(e, error?.status)) return 'No hay conexión. Inténtalo cuando tengas cobertura.';
  return 'No se ha podido guardar. Inténtalo de nuevo.';
}
