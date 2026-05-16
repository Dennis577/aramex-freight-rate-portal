/**
 * auth.js — Admin authentication (SHA-256 + sessionStorage)
 */

const Auth = (() => {
  const SESSION_KEY = 'freight_admin_auth';
  const SESSION_TS  = 'freight_admin_ts';

  /** Check if admin is currently logged in (session not expired) */
  function isLoggedIn() {
    if (sessionStorage.getItem(SESSION_KEY) !== '1') return false;
    const ts = parseInt(sessionStorage.getItem(SESSION_TS) || '0', 10);
    if (Date.now() - ts > CONFIG.SESSION_TIMEOUT_MS) {
      logout();
      return false;
    }
    return true;
  }

  /** Hash a password with SHA-256 and return hex string */
  async function hashPassword(password) {
    const encoded = new TextEncoder().encode(password);
    const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Attempt to log in with plaintext password
   * @returns {Promise<boolean>} true if password correct
   */
  async function login(password) {
    const hash = await hashPassword(password);
    if (hash === CONFIG.ADMIN_PASSWORD_HASH) {
      sessionStorage.setItem(SESSION_KEY, '1');
      sessionStorage.setItem(SESSION_TS,  Date.now().toString());
      return true;
    }
    return false;
  }

  /** Log out and clear session */
  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_TS);
  }

  /**
   * Guard: redirect to login page if not authenticated
   * Call this at the top of every admin page
   */
  function requireLogin(loginUrl = 'admin.html') {
    if (!isLoggedIn()) {
      window.location.replace(loginUrl + '#login');
    }
  }

  return { isLoggedIn, login, logout, requireLogin };
})();
