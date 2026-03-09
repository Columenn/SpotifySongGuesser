document.addEventListener('DOMContentLoaded', function () {
    // Spotify API Config
    const clientId = '9a32bf6e17ca48aeb3c4492943d58d97';
    const redirectUri = window.location.origin + window.location.pathname;
    const SCOPES = 'user-read-currently-playing user-modify-playback-state user-read-private playlist-read-private playlist-read-collaborative';

    // ── Logger ────────────────────────────────────────────────
    const Log = {
        _entry(level, area, msg, data) {
            const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
            const prefix = `[${ts}] [${level}] [${area}]`;
            if (data !== undefined) {
                console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](prefix, msg, data);
            } else {
                console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](prefix, msg);
            }
        },
        info: (area, msg, data) => Log._entry('INFO', area, msg, data),
        warn: (area, msg, data) => Log._entry('WARN', area, msg, data),
        error: (area, msg, data) => Log._entry('ERROR', area, msg, data),
    };

    // DOM Elements
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const authSection = document.getElementById('auth-section');
    const gameSection = document.getElementById('game-section');
    const statusDiv = document.getElementById('status');
    const revealBtn = document.getElementById('reveal-btn');
    const idleHint = document.getElementById('idle-hint');
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
    const playlistBtn = document.getElementById('playlist-btn');
    const playlistPanel = document.getElementById('playlist-panel');
    const playlistOverlay = document.getElementById('playlist-overlay');
    const playlistCloseBtn = document.getElementById('playlist-close-btn');
    const playlistList = document.getElementById('playlist-list');
    const playlistUserName = document.getElementById('playlist-user-name');
    const playlistUserAvatar = document.getElementById('playlist-user-avatar');
    const playlistUserAvatarPh = document.getElementById('playlist-user-avatar-placeholder');

    let accessToken = null;
    let currentTrack = null;
    let currentTrackId = null;
    let checkInterval = null;
    let isShowingInfo = false;
    let isPremium = false;
    let isPlaying = false;
    let activePlaylistUri = null;

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
        Log.info('Auth', 'Login button clicked, starting PKCE flow');
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
        Log.info('Auth', 'User logged out');
        clearInterval(checkInterval);
        clearStoredAuth();
    });

    async function exchangeCodeForToken(code) {
        Log.info('Auth', 'Exchanging authorization code for token');
        const verifier = localStorage.getItem('spotify_pkce_verifier');
        if (!verifier) {
            Log.error('Auth', 'No PKCE verifier found in localStorage');
            throw new Error('No PKCE verifier found');
        }

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

        if (!response.ok) {
            const body = await response.text().catch(() => '(unreadable)');
            Log.error('Auth', `Token exchange failed — HTTP ${response.status}`, body);
            throw new Error('Token exchange failed');
        }

        Log.info('Auth', 'Token exchange successful');
        return response.json();
    }

    async function refreshAccessToken() {
        const refreshToken = localStorage.getItem('spotify_refresh_token');
        if (!refreshToken) {
            Log.warn('Auth', 'Attempted token refresh but no refresh token found');
            return false;
        }
        try {
            Log.info('Auth', 'Refreshing access token');
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: clientId,
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                }),
            });
            if (!response.ok) {
                const body = await response.text().catch(() => '(unreadable)');
                Log.error('Auth', `Token refresh failed — HTTP ${response.status}`, body);
                return false;
            }
            saveTokens(await response.json());
            Log.info('Auth', 'Token refreshed successfully');
            return true;
        } catch (err) {
            Log.error('Auth', 'Token refresh threw an exception', err);
            return false;
        }
    }

    function saveTokens(data) {
        accessToken = data.access_token;
        localStorage.setItem('spotify_access_token', data.access_token);
        if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
        const expiresAt = Date.now() + (data.expires_in - 60) * 1000;
        localStorage.setItem('spotify_token_expires_at', expiresAt.toString());
        Log.info('Auth', `Tokens saved — expires in ${data.expires_in}s`);
    }

    function isTokenExpired() {
        return Date.now() > parseInt(localStorage.getItem('spotify_token_expires_at') || '0');
    }

    // ── Premium check ─────────────────────────────────────────
    async function checkPremium() {
        try {
            Log.info('Premium', 'Checking Spotify account type');
            const res = await fetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!res.ok) {
                Log.error('Premium', `/v1/me returned HTTP ${res.status}`);
                return;
            }
            const data = await res.json();
            isPremium = data.product === 'premium';
            localStorage.setItem('spotify_is_premium', isPremium ? 'true' : 'false');
            Log.info('Premium', `Account type: ${data.product} — isPremium: ${isPremium}`);

            // Populate user footer in playlist panel
            if (data.display_name) {
                playlistUserName.textContent = data.display_name;
            }
            const userLabel = document.getElementById('playlist-user-label');
            if (userLabel && data.id) {
                userLabel.textContent = `Spotify Account (${data.id})`;
            }
            const avatarUrl = data.images?.[0]?.url;
            if (avatarUrl) {
                playlistUserAvatar.src = avatarUrl;
                playlistUserAvatar.style.display = 'block';
                playlistUserAvatarPh.style.display = 'none';
            } else {
                playlistUserAvatar.style.display = 'none';
                playlistUserAvatarPh.style.display = 'flex';
            }
        } catch (err) {
            Log.error('Premium', 'Exception during premium check', err);
        }
    }

    async function checkAuth() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code) {
            Log.info('Auth', 'Authorization code detected in URL, completing login');
            window.history.replaceState({}, document.title, window.location.pathname);
            try {
                const tokenData = await exchangeCodeForToken(code);
                localStorage.removeItem('spotify_pkce_verifier');
                saveTokens(tokenData);
                await checkPremium();
                startMonitoring();
            } catch (err) {
                Log.error('Auth', 'Login flow failed', err);
                statusDiv.textContent = 'Login failed. Please try again.';
            }
            return;
        }

        accessToken = localStorage.getItem('spotify_access_token');
        if (accessToken) {
            Log.info('Auth', 'Existing token found in localStorage');
            if (isTokenExpired()) {
                Log.warn('Auth', 'Stored token is expired — attempting refresh');
                const refreshed = await refreshAccessToken();
                if (!refreshed) {
                    Log.error('Auth', 'Token refresh failed — clearing session');
                    clearStoredAuth();
                    return;
                }
            }
            isPremium = localStorage.getItem('spotify_is_premium') === 'true';
            Log.info('Auth', `Restored session — cached isPremium: ${isPremium}`);
            checkPremium();
            startMonitoring();
        } else {
            Log.info('Auth', 'No stored token — showing login screen');
        }
    }

    function clearStoredAuth() {
        Log.info('Auth', 'Clearing all stored auth data');
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_token_expires_at');
        localStorage.removeItem('spotify_is_premium');
        accessToken = null;
        isPremium = false;
        authSection.classList.remove('hidden');
        gameSection.classList.add('hidden');
        logoutBtn.classList.add('hidden');
        playlistBtn.classList.add('hidden');
    }

    function startMonitoring() {
        Log.info('Player', 'Starting playback monitoring (2s interval)');
        authSection.classList.add('hidden');
        gameSection.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');
        playlistBtn.classList.remove('hidden');
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
            Log.warn('Player', 'Token expired before polling — refreshing');
            const refreshed = await refreshAccessToken();
            if (!refreshed) {
                Log.error('Player', 'Could not refresh token — stopping monitoring');
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
                    if (currentTrackId && data.item.id !== currentTrackId) {
                        Log.info('Player', `Track changed: "${data.item.name}" by ${data.item.artists.map(a => a.name).join(', ')}`);
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
                        idleHint.classList.add('hidden');
                        setRevealLoading(false);
                        revealBtn.classList.remove('hidden');
                    }
                } else {
                    resetToIdle();
                }
            } else if (response.status === 204) {
                resetToIdle();
            } else if (response.status === 401) {
                Log.warn('Player', 'Polling returned 401 — refreshing token');
                const refreshed = await refreshAccessToken();
                if (!refreshed) {
                    Log.error('Player', '401 refresh failed — stopping monitoring');
                    clearInterval(checkInterval);
                    clearStoredAuth();
                    statusDiv.textContent = 'Session expired. Please login again.';
                }
            } else {
                Log.warn('Player', `Unexpected polling status: ${response.status}`);
            }
        } catch (error) {
            Log.error('Player', 'Exception during playback poll', error);
            statusDiv.textContent = 'Error checking playback status';
        }
    }

    function resetToIdle() {
        statusDiv.textContent = 'No song currently playing';
        revealBtn.classList.add('hidden');
        idleHint.classList.remove('hidden');
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
        if (isTokenExpired()) {
            Log.warn('Controls', 'Token expired before action — refreshing');
            await refreshAccessToken();
        }
    }

    async function skipToNext() {
        await ensureFreshToken();
        skipBtn.classList.add('pressed');
        setTimeout(() => skipBtn.classList.remove('pressed'), 150);
        try {
            Log.info('Controls', 'Skipping to next track');
            const res = await fetch('https://api.spotify.com/v1/me/player/next', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!res.ok) Log.error('Controls', `Skip failed — HTTP ${res.status}`);
            songInfo.classList.add('hidden');
            songInfo.classList.remove('revealed', 'revealing');
            cardBg.classList.remove('loaded');
            isShowingInfo = false;
            currentTrackId = null;
            setRevealLoading(true);
        } catch (err) {
            Log.error('Controls', 'Exception during skip', err);
        }
    }

    async function restartSong() {
        await ensureFreshToken();
        restartBtn.classList.add('pressed');
        setTimeout(() => restartBtn.classList.remove('pressed'), 150);
        try {
            Log.info('Controls', 'Restarting current track');
            const res = await fetch('https://api.spotify.com/v1/me/player/seek?position_ms=0', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!res.ok) Log.error('Controls', `Restart failed — HTTP ${res.status}`);
        } catch (err) {
            Log.error('Controls', 'Exception during restart', err);
        }
    }

    async function togglePlayPause() {
        await ensureFreshToken();
        playpauseBtn.classList.add('pressed');
        setTimeout(() => playpauseBtn.classList.remove('pressed'), 150);
        try {
            const action = isPlaying ? 'pause' : 'play';
            const endpoint = isPlaying
                ? 'https://api.spotify.com/v1/me/player/pause'
                : 'https://api.spotify.com/v1/me/player/play';
            Log.info('Controls', `Toggling playback: ${action}`);
            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!res.ok) Log.error('Controls', `Play/pause failed — HTTP ${res.status}`);
            setPlayingState(!isPlaying);
        } catch (err) {
            Log.error('Controls', 'Exception during play/pause toggle', err);
        }
    }

    // ── Reveal ────────────────────────────────────────────────
    revealBtn.addEventListener('click', () => {
        if (!currentTrack) return;

        Log.info('Reveal', `Revealing: "${currentTrack.name}" (${currentTrack.album.release_date.slice(0, 4)})`);

        artistSpan.textContent = currentTrack.artists.map(a => a.name).join(', ');
        yearSpan.textContent = currentTrack.album.release_date.split('-')[0];
        songNameSpan.textContent = currentTrack.name;

        const albumArt = currentTrack.album.images[0]?.url;
        if (albumArt) {
            cardBg.style.backgroundImage = `url(${albumArt})`;
        } else {
            Log.warn('Reveal', 'No album art found for current track');
        }

        songInfo.classList.remove('revealed', 'revealing');
        songInfo.classList.remove('hidden');
        revealBtn.classList.add('hidden');
        isShowingInfo = true;

        requestAnimationFrame(() => {
            songInfo.classList.add('revealing');
            requestAnimationFrame(() => { cardBg.classList.add('loaded'); });
            setTimeout(() => { songInfo.classList.add('revealed'); }, 80);

            const controlsBar = document.getElementById('controls-bar');
            if (isPremium) {
                controlsBar.classList.remove('hidden');
                setTimeout(() => controlsBar.classList.add('visible'), 100);
            } else {
                Log.info('Reveal', 'Controls bar hidden — non-premium account');
                controlsBar.classList.add('hidden');
                controlsBar.classList.remove('visible');
            }
        });
    });

    skipBtn.addEventListener('click', skipToNext);
    restartBtn.addEventListener('click', restartSong);
    playpauseBtn.addEventListener('click', togglePlayPause);

    // ── Playlist panel ────────────────────────────────────────
    function openPlaylistPanel() {
        Log.info('Playlists', 'Opening playlist panel');
        playlistPanel.classList.remove('hidden');
        playlistOverlay.classList.remove('hidden');
        requestAnimationFrame(() => {
            playlistOverlay.classList.add('visible');
            playlistPanel.classList.add('open');
        });
        fetchPlaylists();
    }

    function closePlaylistPanel() {
        Log.info('Playlists', 'Closing playlist panel');
        playlistPanel.classList.remove('open');
        playlistOverlay.classList.remove('visible');
        setTimeout(() => {
            playlistPanel.classList.add('hidden');
            playlistOverlay.classList.add('hidden');
        }, 350);
    }

    async function fetchPlaylists() {
        playlistList.innerHTML = `
            <div class="playlist-loading">
                <span class="dot">●</span><span class="dot">●</span><span class="dot">●</span>
            </div>`;

        const FEATURED_IDS = [
            '3Pft9VkD2PXIK9EPOlVo9Z',
            '26zIHVncgI9HmHlgYWwnDi',
            '2jlbmBYM1RLZrsyY67wuDQ',
            '0sDahzOkMWOmLXfTMf2N4N',
            '0h4Cwla6c6Yy1QW7mihUsP',
        ];

        try {
            await ensureFreshToken();

            Log.info('Playlists', `Fetching ${FEATURED_IDS.length} featured playlists`);
            const featuredResults = await Promise.all(
                FEATURED_IDS.map(async id => {
                    try {
                        const res = await fetch(
                            `https://api.spotify.com/v1/playlists/${id}?fields=uri,name,images,tracks.total`,
                            { headers: { 'Authorization': `Bearer ${accessToken}` } }
                        );
                        if (res.status === 404) {
                            Log.warn('Playlists', `Featured playlist not found (deleted?): ${id}`);
                            return null;
                        }
                        if (res.status === 403) {
                            Log.warn('Playlists', `Featured playlist access denied (private?): ${id}`);
                            return null;
                        }
                        if (!res.ok) {
                            Log.error('Playlists', `Featured playlist fetch failed — HTTP ${res.status} for ID: ${id}`);
                            return null;
                        }
                        const data = await res.json();
                        Log.info('Playlists', `Loaded featured playlist: "${data.name}" (${id})`);
                        return data;
                    } catch (err) {
                        Log.error('Playlists', `Exception fetching featured playlist ${id}`, err);
                        return null;
                    }
                })
            );

            const featured = featuredResults.filter(Boolean);
            Log.info('Playlists', `${featured.length}/${FEATURED_IDS.length} featured playlists loaded successfully`);

            Log.info('Playlists', 'Fetching user playlists (page 1)');
            const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50&offset=0', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!res.ok) {
                Log.error('Playlists', `User playlists fetch failed — HTTP ${res.status}`);
                throw new Error('Failed to fetch playlists');
            }
            const data = await res.json();
            Log.info('Playlists', `Loaded ${data.items.length} user playlists (total: ${data.total})`);

            playlistList.innerHTML = '';

            if (featured.length) {
                const featuredHeader = document.createElement('div');
                featuredHeader.className = 'playlist-section-label';
                featuredHeader.textContent = 'Featured';
                playlistList.appendChild(featuredHeader);
                appendPlaylistItems(featured);

                const divider = document.createElement('div');
                divider.className = 'playlist-divider';
                playlistList.appendChild(divider);
            } else {
                Log.warn('Playlists', 'No featured playlists available — section hidden');
            }

            const userHeader = document.createElement('div');
            userHeader.className = 'playlist-section-label';
            userHeader.textContent = 'Your Playlists';
            playlistList.appendChild(userHeader);

            appendPlaylistItems(data.items);
            if (data.next) {
                Log.info('Playlists', 'More user playlists available — attaching scroll sentinel');
                appendLoadSentinel(data.next);
            }

        } catch (err) {
            Log.error('Playlists', 'Fatal error loading playlist panel', err);
            playlistList.innerHTML = `<p style="color:#b3b3b3;text-align:center;padding:20px;font-size:13px;">Could not load playlists.</p>`;
        }
    }

    let sentinelObserver = null;

    function appendLoadSentinel(nextUrl) {
        if (sentinelObserver) sentinelObserver.disconnect();

        const sentinel = document.createElement('div');
        sentinel.className = 'playlist-sentinel';
        sentinel.innerHTML = `
            <div class="playlist-loading" style="padding:16px 0;">
                <span class="dot">●</span><span class="dot">●</span><span class="dot">●</span>
            </div>`;
        playlistList.appendChild(sentinel);

        sentinelObserver = new IntersectionObserver(async (entries) => {
            if (!entries[0].isIntersecting) return;
            sentinelObserver.disconnect();
            sentinel.remove();

            try {
                await ensureFreshToken();
                Log.info('Playlists', `Loading next page: ${nextUrl}`);
                const res = await fetch(nextUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (!res.ok) {
                    Log.error('Playlists', `Paginated playlist fetch failed — HTTP ${res.status}`);
                    return;
                }
                const data = await res.json();
                Log.info('Playlists', `Loaded ${data.items.length} more playlists`);
                appendPlaylistItems(data.items);
                if (data.next) appendLoadSentinel(data.next);
            } catch (err) {
                Log.error('Playlists', 'Exception during paginated playlist fetch', err);
            }
        }, { root: playlistList, threshold: 0.1 });

        sentinelObserver.observe(sentinel);
    }

    function appendPlaylistItems(playlists) {
        const PLAY_ICON_SVG = `
            <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
                <path d="M8 5v14l11-7z"/>
            </svg>`;

        playlists.forEach(p => {
            if (!p) return;
            const isActive = p.uri === activePlaylistUri;
            const img = p.images?.[0]?.url;

            const item = document.createElement('div');
            item.className = `playlist-item${isActive ? ' active' : ''}`;
            item.dataset.uri = p.uri;

            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'playlist-img-wrapper';

            if (img) {
                const imgEl = document.createElement('img');
                imgEl.className = 'playlist-item-img';
                imgEl.alt = p.name;
                imgEl.loading = 'lazy';
                imgEl.src = img;
                imgWrapper.appendChild(imgEl);
            } else {
                const placeholder = document.createElement('div');
                placeholder.className = 'playlist-item-img-placeholder';
                placeholder.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>`;
                imgWrapper.appendChild(placeholder);
            }

            const overlay = document.createElement('div');
            overlay.className = 'playlist-img-overlay';
            overlay.innerHTML = PLAY_ICON_SVG;
            imgWrapper.appendChild(overlay);

            const info = document.createElement('div');
            info.className = 'playlist-item-info';
            info.innerHTML = `
                <div class="playlist-item-name">${p.name}</div>
                <div class="playlist-item-meta">${p.tracks.total} songs</div>`;

            item.appendChild(imgWrapper);
            item.appendChild(info);
            playlistList.appendChild(item);

            item.addEventListener('mouseenter', () => {
                const nameEl = item.querySelector('.playlist-item-name');
                const overflow = nameEl.scrollWidth - nameEl.clientWidth;
                if (overflow > 0) {
                    nameEl.classList.add('overflowing');
                    nameEl.style.setProperty('--marquee-offset', `-${overflow + 16}px`);
                }
            });
            item.addEventListener('mouseleave', () => {
                const nameEl = item.querySelector('.playlist-item-name');
                nameEl.classList.remove('overflowing');
                nameEl.style.removeProperty('--marquee-offset');
            });

            item.addEventListener('click', () => {
                Log.info('Playlists', `User selected playlist: "${p.name}" (${p.uri})`);
                playPlaylist(p.uri, p.tracks.total);
                playlistList.querySelectorAll('.playlist-item').forEach(i => {
                    i.classList.remove('active');
                    i.querySelector('.playlist-item-name').style.color = '';
                });
                item.classList.add('active');
                item.querySelector('.playlist-item-name').style.color = '#1DB954';
                activePlaylistUri = p.uri;
                setTimeout(closePlaylistPanel, 300);
            });
        });
    }

    async function playPlaylist(uri, totalTracks) {
        await ensureFreshToken();
        try {
            // Pick a random starting position within the playlist
            const randomPosition = totalTracks > 1
                ? Math.floor(Math.random() * totalTracks)
                : 0;
            Log.info('Playlists', `Starting playlist: ${uri} — random position ${randomPosition}/${totalTracks}`);

            const res = await fetch('https://api.spotify.com/v1/me/player/play', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ context_uri: uri, offset: { position: randomPosition }, position_ms: 0 })
            });
            if (!res.ok) {
                const body = await res.text().catch(() => '(unreadable)');
                Log.error('Playlists', `Play playlist failed — HTTP ${res.status}`, body);
                return;
            }

            // Enable shuffle so subsequent tracks are also random
            Log.info('Playlists', 'Enabling shuffle');
            const shuffleRes = await fetch('https://api.spotify.com/v1/me/player/shuffle?state=true', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (!shuffleRes.ok) {
                Log.warn('Playlists', `Shuffle request failed — HTTP ${shuffleRes.status} (non-fatal)`);
            } else {
                Log.info('Playlists', 'Shuffle enabled successfully');
            }

            Log.info('Playlists', 'Playlist started successfully');
            songInfo.classList.add('hidden');
            songInfo.classList.remove('revealed', 'revealing');
            cardBg.classList.remove('loaded');
            isShowingInfo = false;
            currentTrackId = null;
            setRevealLoading(true);
        } catch (err) {
            Log.error('Playlists', 'Exception while starting playlist', err);
        }
    }

    playlistBtn.addEventListener('click', openPlaylistPanel);
    playlistCloseBtn.addEventListener('click', closePlaylistPanel);
    playlistOverlay.addEventListener('click', closePlaylistPanel);

    checkAuth();
});