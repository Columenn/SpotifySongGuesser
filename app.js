document.addEventListener('DOMContentLoaded', function () {
    // Spotify API Config
    const clientId = '9a32bf6e17ca48aeb3c4492943d58d97';
    const redirectUri = window.location.origin + window.location.pathname;
    const SCOPES = 'user-read-currently-playing user-modify-playback-state user-read-private';

    // DOM Elements
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const authSection = document.getElementById('auth-section');
    const gameSection = document.getElementById('game-section');
    const statusDiv = document.getElementById('status');
    const revealBtn = document.getElementById('reveal-btn');
    const songInfo = document.getElementById('song-info');
    const artistSpan = document.getElementById('artist');
    const yearSpan = document.getElementById('year');
    const songNameSpan = document.getElementById('song-name');
    const cardBg = document.getElementById('card-bg');
    const skipBtn = document.getElementById('skip-btn');
    const restartBtn = document.getElementById('restart-btn');
    const playpauseBtn = document.getElementById('playpause-btn');
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');

    let accessToken = null;
    let currentTrack = null;
    let currentTrackId = null;
    let checkInterval = null;
    let isShowingInfo = false;
    let isPremium = false;
    let isPlaying = false;

    // ── PKCE Helpers ──────────────────────────────────────────
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

    // ── Auth ──────────────────────────────────────────────────
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

    logoutBtn.addEventListener('click', () => {
        clearInterval(checkInterval);
        clearStoredAuth();
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
            saveTokens(await response.json());
            return true;
        } catch { return false; }
    }

    function saveTokens(data) {
        accessToken = data.access_token;
        localStorage.setItem('spotify_access_token', data.access_token);
        if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
        const expiresAt = Date.now() + (data.expires_in - 60) * 1000;
        localStorage.setItem('spotify_token_expires_at', expiresAt.toString());
    }

    function isTokenExpired() {
        return Date.now() > parseInt(localStorage.getItem('spotify_token_expires_at') || '0');
    }

    // ── Premium check ─────────────────────────────────────────
    async function checkPremium() {
        try {
            const res = await fetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            isPremium = data.product === 'premium';
            localStorage.setItem('spotify_is_premium', isPremium ? 'true' : 'false');
        } catch (err) { console.error('Premium check failed:', err); }
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
                if (!refreshed) { clearStoredAuth(); return; }
            }
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
        logoutBtn.classList.add('hidden');
    }

    function startMonitoring() {
        authSection.classList.add('hidden');
        gameSection.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');
        checkInterval = setInterval(checkCurrentlyPlaying, 2000);
        checkCurrentlyPlaying();
    }

    // ── Playback state ────────────────────────────────────────
    function setPlayingState(playing) {
        isPlaying = playing;
        if (playing) {
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
        } else {
            pauseIcon.classList.add('hidden');
            playIcon.classList.remove('hidden');
        }
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
                if (data.item) {
                    // Track changed — reset card
                    if (currentTrackId && data.item.id !== currentTrackId) {
                        isShowingInfo = false;
                        songInfo.classList.add('hidden');
                        songInfo.classList.remove('revealed', 'revealing');
                        cardBg.classList.remove('loaded');
                    }
                    currentTrack = data.item;
                    currentTrackId = data.item.id;
                    setPlayingState(data.is_playing);
                    statusDiv.textContent = data.is_playing ? 'Song detected!' : 'Song paused';
                    if (!isShowingInfo) {
                        setRevealLoading(false);
                        revealBtn.classList.remove('hidden');
                    }
                } else {
                    resetToIdle();
                }
            } else if (response.status === 204) {
                resetToIdle();
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

    function resetToIdle() {
        statusDiv.textContent = 'No song currently playing';
        revealBtn.classList.add('hidden');
        songInfo.classList.add('hidden');
        songInfo.classList.remove('revealed', 'revealing');
        cardBg.classList.remove('loaded');
        isShowingInfo = false;
        setPlayingState(false);
    }

    // ── Loading state ─────────────────────────────────────────
    let loadingStartTime = 0;
    const MIN_LOADING_MS = 500;

    function setRevealLoading(loading) {
        if (loading) {
            loadingStartTime = Date.now();
            revealBtn.classList.remove('hidden');
            revealBtn.disabled = true;
            revealBtn.classList.add('loading');
        } else {
            const elapsed = Date.now() - loadingStartTime;
            const remaining = MIN_LOADING_MS - elapsed;
            if (remaining > 0) {
                setTimeout(() => {
                    revealBtn.disabled = false;
                    revealBtn.classList.remove('loading');
                }, remaining);
            } else {
                revealBtn.disabled = false;
                revealBtn.classList.remove('loading');
            }
        }
    }

    // ── Controls ──────────────────────────────────────────────
    async function ensureFreshToken() {
        if (isTokenExpired()) await refreshAccessToken();
    }

    async function skipToNext() {
        await ensureFreshToken();
        skipBtn.classList.add('pressed');
        setTimeout(() => skipBtn.classList.remove('pressed'), 150);
        try {
            await fetch('https://api.spotify.com/v1/me/player/next', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            songInfo.classList.add('hidden');
            songInfo.classList.remove('revealed', 'revealing');
            cardBg.classList.remove('loaded');
            isShowingInfo = false;
            currentTrackId = null;
            setRevealLoading(true);
        } catch (err) { console.error('Skip error:', err); }
    }

    async function restartSong() {
        await ensureFreshToken();
        restartBtn.classList.add('pressed');
        setTimeout(() => restartBtn.classList.remove('pressed'), 150);
        try {
            await fetch('https://api.spotify.com/v1/me/player/seek?position_ms=0', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
        } catch (err) { console.error('Restart error:', err); }
    }

    async function togglePlayPause() {
        await ensureFreshToken();
        playpauseBtn.classList.add('pressed');
        setTimeout(() => playpauseBtn.classList.remove('pressed'), 150);
        try {
            const endpoint = isPlaying
                ? 'https://api.spotify.com/v1/me/player/pause'
                : 'https://api.spotify.com/v1/me/player/play';
            await fetch(endpoint, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            setPlayingState(!isPlaying);
        } catch (err) { console.error('Play/pause error:', err); }
    }

    // ── Reveal ────────────────────────────────────────────────
    revealBtn.addEventListener('click', () => {
        if (!currentTrack) return;

        artistSpan.textContent = currentTrack.artists.map(a => a.name).join(', ');
        yearSpan.textContent = currentTrack.album.release_date.split('-')[0];
        songNameSpan.textContent = currentTrack.name;

        // Set album art as blurred card background
        const albumArt = currentTrack.album.images[0]?.url;
        if (albumArt) {
            cardBg.style.backgroundImage = `url(${albumArt})`;
        }

        // Reset animation classes
        songInfo.classList.remove('revealed', 'revealing');
        songInfo.classList.remove('hidden');
        revealBtn.classList.add('hidden');
        isShowingInfo = true;

        // 1. Card pops in
        requestAnimationFrame(() => {
            songInfo.classList.add('revealing');

            // 2. Fade in the album art bg
            requestAnimationFrame(() => {
                cardBg.classList.add('loaded');
            });

            // 3. Staggered text slides up
            setTimeout(() => {
                songInfo.classList.add('revealed');
            }, 80);

            // 4. Controls bar slides up
            const controlsBar = document.getElementById('controls-bar');
            if (isPremium) {
                controlsBar.classList.remove('hidden');
                setTimeout(() => controlsBar.classList.add('visible'), 100);
            } else {
                controlsBar.classList.add('hidden');
                controlsBar.classList.remove('visible');
            }
        });
    });

    skipBtn.addEventListener('click', skipToNext);
    restartBtn.addEventListener('click', restartSong);
    playpauseBtn.addEventListener('click', togglePlayPause);

    checkAuth();
});