// Client-side login module for Google OAuth (access token flow)
// Usage: import { initLogin } from './scripts/login.js'; then call initLogin();

const GOOGLE_CLIENT_ID = '329569744826-3buqrpvlhqn4ksca7n3go7t3fepd1cpd.apps.googleusercontent.com'; // set your client id here

let tokenClient = null;

function initGoogleScript() {
    return new Promise((resolve, reject) => {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load Google Identity script'));
        document.head.appendChild(s);
    });
}

async function ensureTokenClient() {
    if (tokenClient) return tokenClient;
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === '329569744826-3buqrpvlhqn4ksca7n3go7t3fepd1cpd.apps.googleusercontent.com') {
        console.warn('Please set GOOGLE_CLIENT_ID in scripts/login.js to enable Google login.');
        return null;
    }
    await initGoogleScript();
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'openid email profile',
        callback: (resp) => {
            if (resp.error) {
                console.error('Token error', resp);
                return;
            }
            // send access token to server for verification and user creation
            exchangeTokenWithServer(resp.access_token);
        }
    });
    return tokenClient;
}

async function exchangeTokenWithServer(accessToken) {
    try {
        // Netlify Functions endpoint
        // Automatically resolved on Netlify, works in development and production
        const authEndpoint = '/.netlify/functions/auth-google';
        
        const res = await fetch(authEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: accessToken })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            console.error('Server auth failed:', data);
            alert('Login gagal: ' + (data.error || 'Unknown error'));
            return;
        }
        
        if (data && data.user) {
            updateUIAfterLogin(data.user);
            console.log('Login successful:', data.user);
        } else {
            console.error('Invalid server response', data);
            alert('Login response invalid');
        }
    } catch (err) {
        console.error('Auth exchange error', err);
        alert('Login error: ' + err.message);
    }
}

function updateUIAfterLogin(user) {
    // Replace login button with "Sign out?" text only
    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn) return;
    loginBtn.innerHTML = '<span class="login-text">Sign out?</span>';
    loginBtn.classList.add('logged-in');
    loginBtn.title = user.email || 'Logged in';
    // store user in window for later use
    window.currentUser = user;
    // Save user to localStorage to persist login across page loads
    localStorage.setItem('currentUser', JSON.stringify(user));
    
    // Dispatch custom event so other scripts know user logged in
    const event = new CustomEvent('userLoggedIn', { detail: user });
    window.dispatchEvent(event);
}

function logout() {
    // Clear user data from window and localStorage
    window.currentUser = null;
    localStorage.removeItem('currentUser');
    
    // Reset UI back to login button
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.innerHTML = '<span class="login-text">Login</span>';
        loginBtn.classList.remove('logged-in');
        loginBtn.title = 'Login dengan Google';
    }
    
    // Dispatch custom event so other scripts know user logged out
    const event = new CustomEvent('userLoggedOut');
    window.dispatchEvent(event);
}

export async function initLogin() {
    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn) return;

    // Restore user from localStorage if available
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        try {
            const user = JSON.parse(storedUser);
            updateUIAfterLogin(user);
        } catch (e) {
            console.debug('Failed to restore user from localStorage:', e);
        }
    }

    // Login/Logout button click handler
    loginBtn.addEventListener('click', async () => {
        if (window.currentUser) {
            // If logged in, logout
            logout();
            return;
        }
        
        // If not logged in, initiate login flow
        const tc = await ensureTokenClient();
        if (!tc) {
            alert('Google login belum di-setup. Masukkan Client ID di scripts/login.js');
            return;
        }
        tc.requestAccessToken({ prompt: 'consent' });
    });
}
