/**
 * auth.js — Admin authentication (SHA-256 + sessionStorage)
 *
 * Multi-account system:
 *   admin        → role: 'admin',  can access Settings tab
 *   PVG_Pricing  → role: 'pricing', can only manage rates
 *   PEK_Pricing  → role: 'pricing', can only manage rates
 *   CAN_Pricing  → role: 'pricing', can only manage rates
 */

const Auth = (() => {
  const SESSION_KEY  = 'freight_admin_auth';
  const SESSION_USER  = 'freight_admin_user';
  const SESSION_ROLE  = 'freight_admin_role';
  const SESSION_TS    = 'freight_admin_ts';

  // ── Hash helper ──────────────────────────────────────────
  async function hashPassword(password) {
    const encoded = new TextEncoder().encode(password);
    const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ── Check ────────────────────────────────────────────────
  function isLoggedIn() {
    if (sessionStorage.getItem(SESSION_KEY) !== '1') return false;
    const ts = parseInt(sessionStorage.getItem(SESSION_TS) || '0', 10);
    if (Date.now() - ts > CONFIG.SESSION_TIMEOUT_MS) {
      logout();
      return false;
    }
    return true;
  }

  /** Get current logged-in username */
  function getUsername() {
    return sessionStorage.getItem(SESSION_USER) || 'admin';
  }

  /** Get current logged-in role */
  function getRole() {
    return sessionStorage.getItem(SESSION_ROLE) || 'admin';
  }

  /** Check if current user has admin privileges (can modify Settings) */
  function isAdmin() {
    return getRole() === 'admin';
  }

  /**
   * Attempt to log in with account name + plaintext password
   * @param {string} accountName — e.g. 'admin', 'PVG_Pricing'
   * @param {string} password
   * @returns {Promise<boolean>} true if credentials correct
   */
  async function login(accountName, password) {
    const account = CONFIG.ACCOUNTS[accountName];
    if (!account) return false;

    const hash = await hashPassword(password);
    if (hash !== account.hash) return false;

    sessionStorage.setItem(SESSION_KEY,  '1');
    sessionStorage.setItem(SESSION_USER, accountName);
    sessionStorage.setItem(SESSION_ROLE, account.role);
    sessionStorage.setItem(SESSION_TS,   Date.now().toString());
    return true;
  }

  /** Log out and clear session */
  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_USER);
    sessionStorage.removeItem(SESSION_ROLE);
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

  return { isLoggedIn, getUsername, getRole, isAdmin, login, logout, requireLogin };
})();
