document.addEventListener('DOMContentLoaded', function () {
    // Spotify API Config
    const clientId = '9a32bf6e17ca48aeb3c4492943d58d97';
    const redirectUri = window.location.origin + window.location.pathname;
    const SCOPES = 'user-read-currently-playing user-modify-playback-state user-read-private';

    // DOM Elements
    const loginBtn = document.getElementById('login-btn');
    const authSection = document.getElementById('auth-section');
    const gameSection = document.getElementById('game-section');
    const statusDiv = document.getElementById('status');
    const revealBtn = document.getElementById('reveal-btn');
    const songInfo = document.getElementById('song-info');
    const artistSpan = document.getElementById('artist');
    const yearSpan = document.getElementById('year');
    const songNameSpan = document.getElementById('song-name');
    const skipBtn = document.getElementById('skip-btn');

    let accessToken = null;
    let currentTrack = null;
    let currentTrackId = null;
    let checkInterval = null;
    let isShowingInfo = false;
    let isPremium = false;

    // --- PKCE Helpers ---
    function generateRandomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return Array.from(array, byte => chars[byte % chars.length]).join('');
    }

    async function generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    // --- Auth ---
    loginBtn.addEventListener('click', async () => {
        const verifier = generateRandomString(64);
        const challenge = await generateCodeChallenge(verifier);
        localStorage.setItem('spotify_pkce_verifier', verifier);

        const params = new URLSearchParams({
            client_id: clientId,
            response_type: 'code',
            redirect_uri: redirectUri,
            scope: SCOPES,
            code_challenge_method: 'S256',
            code_challenge: challenge,
        });

        window.location.href = `https://accounts.spotify.com/authorize?${params}`;
    });

    async function exchangeCodeForToken(code) {
        const verifier = localStorage.getItem('spotify_pkce_verifier');
        if (!verifier) throw new Error('No PKCE verifier found');

        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                code_verifier: verifier,
            }),
        });

        if (!response.ok) throw new Error('Token exchange failed');
        return response.json();
    }

    async function refreshAccessToken() {
        const refreshToken = localStorage.getItem('spotify_refresh_token');
        if (!refreshToken) return false;

        try {
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId,
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                }),
            });

            if (!response.ok) return false;
            const data = await response.json();
            saveTokens(data);
            return true;
        } catch {
            return false;
        }
    }

    function saveTokens(data) {
        accessToken = data.access_token;
        localStorage.setItem('spotify_access_token', data.access_token);
        if (data.refresh_token) {
            localStorage.setItem('spotify_refresh_token', data.refresh_token);
        }
        const expiresAt = Date.now() + (data.expires_in - 60) * 1000;
        localStorage.setItem('spotify_token_expires_at', expiresAt.toString());
    }

    function isTokenExpired() {
        const expiresAt = parseInt(localStorage.getItem('spotify_token_expires_at') || '0');
        return Date.now() > expiresAt;
    }

    // --- Premium check ---
    async function checkPremium() {
        try {
            const response = await fetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!response.ok) return;
            const data = await response.json();
            isPremium = data.product === 'premium';
            localStorage.setItem('spotify_is_premium', isPremium ? 'true' : 'false');
        } catch (err) {
            console.error('Could not check premium status:', err);
        }
    }

    async function checkAuth() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code) {
            window.history.replaceState({}, document.title, window.location.pathname);
            try {
                const tokenData = await exchangeCodeForToken(code);
                localStorage.removeItem('spotify_pkce_verifier');
                saveTokens(tokenData);
                await checkPremium();
                startMonitoring();
            } catch (err) {
                console.error('Auth error:', err);
                statusDiv.textContent = 'Login failed. Please try again.';
            }
            return;
        }

        accessToken = localStorage.getItem('spotify_access_token');
        if (accessToken) {
            if (isTokenExpired()) {
                const refreshed = await refreshAccessToken();
                if (!refreshed) {
                    clearStoredAuth();
                    return;
                }
            }
            // Restore cached premium status, then re-verify in background
            isPremium = localStorage.getItem('spotify_is_premium') === 'true';
            checkPremium();
            startMonitoring();
        }
    }

    function clearStoredAuth() {
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_token_expires_at');
        localStorage.removeItem('spotify_is_premium');
        accessToken = null;
        isPremium = false;
        authSection.classList.remove('hidden');
        gameSection.classList.add('hidden');
    }

    function startMonitoring() {
        authSection.classList.add('hidden');
        gameSection.classList.remove('hidden');
        checkInterval = setInterval(checkCurrentlyPlaying, 2000);
        checkCurrentlyPlaying();
    }

    async function checkCurrentlyPlaying() {
        if (isTokenExpired()) {
            const refreshed = await refreshAccessToken();
            if (!refreshed) {
                clearInterval(checkInterval);
                clearStoredAuth();
                statusDiv.textContent = 'Session expired. Please login again.';
                return;
            }
        }

        try {
            const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (response.status === 200) {
                const data = await response.json();
                if (data.is_playing && data.item) {
                    if (currentTrackId && data.item.id !== currentTrackId) {
                        isShowingInfo = false;
                        songInfo.classList.add('hidden');
                    }
                    currentTrack = data.item;
                    currentTrackId = data.item.id;
                    statusDiv.textContent = 'Song detected!';
                    if (!isShowingInfo) revealBtn.classList.remove('hidden');
                } else {
                    statusDiv.textContent = 'No song currently playing';
                    revealBtn.classList.add('hidden');
                    songInfo.classList.add('hidden');
                    isShowingInfo = false;
                }
            } else if (response.status === 204) {
                statusDiv.textContent = 'No song currently playing';
                revealBtn.classList.add('hidden');
                songInfo.classList.add('hidden');
                isShowingInfo = false;
            } else if (response.status === 401) {
                const refreshed = await refreshAccessToken();
                if (!refreshed) {
                    clearInterval(checkInterval);
                    clearStoredAuth();
                    statusDiv.textContent = 'Session expired. Please login again.';
                }
            }
        } catch (error) {
            console.error('Error checking currently playing:', error);
            statusDiv.textContent = 'Error checking playback status';
        }
    }

    async function skipToNext() {
        if (isTokenExpired()) await refreshAccessToken();

        skipBtn.classList.add('spinning');
        setTimeout(() => skipBtn.classList.remove('spinning'), 500);

        try {
            await fetch('https://api.spotify.com/v1/me/player/next', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            // Optimistically reset UI — polling will pick up the new track
            songInfo.classList.add('hidden');
            revealBtn.classList.add('hidden');
            isShowingInfo = false;
            currentTrackId = null;
            statusDiv.textContent = 'Skipping...';
        } catch (error) {
            console.error('Error skipping track:', error);
        }
    }

    revealBtn.addEventListener('click', () => {
        if (!currentTrack) return;
        artistSpan.textContent = currentTrack.artists.map(a => a.name).join(', ');
        yearSpan.textContent = currentTrack.album.release_date.split('-')[0];
        songNameSpan.textContent = currentTrack.name;
        songInfo.classList.remove('hidden');
        revealBtn.classList.add('hidden');
        isShowingInfo = true;

        // Only show skip button for premium users
        if (isPremium) {
            skipBtn.classList.remove('hidden');
        }
    });

    skipBtn.addEventListener('click', skipToNext);

    checkAuth();
});