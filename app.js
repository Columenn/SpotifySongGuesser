document.addEventListener('DOMContentLoaded', function() {
    // Spotify API Config
    const clientId = '9a32bf6e17ca48aeb3c4492943d58d97';
    const redirectUri = 'https://columenn.github.io/SpotifySongGuesser/';
    
    let accessToken = null;
    let player = null;
    let deviceId = null;
    let playlistId = null;
    let playlistTracks = [];
    let currentTrack = null;
    
    // DOM Elements
    const playlistInput = document.getElementById('playlist-input');
    const playlistUrlInput = document.getElementById('playlist-url');
    const loadPlaylistBtn = document.getElementById('load-playlist');
    const gameSection = document.getElementById('game-section');
    const playerStatus = document.getElementById('player-status');
    const revealBtn = document.getElementById('reveal-btn');
    const songInfo = document.getElementById('song-info');
    const artistSpan = document.getElementById('artist');
    const yearSpan = document.getElementById('year');
    const songNameSpan = document.getElementById('song-name');
    const nextSongBtn = document.getElementById('next-song');
    
    // Initialize
    checkAuth();
    
    // Event Listeners
    loadPlaylistBtn.addEventListener('click', loadPlaylist);
    revealBtn.addEventListener('click', revealSong);
    nextSongBtn.addEventListener('click', playRandomSong);
    
    // Utility Functions
    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }
    
    function showError(message) {
        if (isIOS()) {
            message += '\n\niOS Users: Please try:\n' +
                      '1. Use Chrome browser\n' +
                      '2. Disable "Prevent Cross-Site Tracking" in Safari Settings\n' +
                      '3. Clear website data (Settings > Safari > Advanced)';
        }
        alert(message);
    }
    
    function getAccessToken() {
        // Check multiple storage locations for iOS compatibility
        return localStorage.getItem("spotify_access_token") || 
               sessionStorage.getItem("spotify_access_token") || 
               accessToken;
    }
    
    function checkAuth() {
        resetGameState();
        
        const params = new URLSearchParams(window.location.hash.substring(1));
        const token = params.get('access_token');
        
        if (token) {
            accessToken = token;
            // Store in both localStorage and sessionStorage for iOS
            localStorage.setItem("spotify_access_token", token);
            sessionStorage.setItem("spotify_access_token", token);
            window.history.pushState({}, document.title, window.location.pathname);
            loadSpotifySDK();
        } else {
            accessToken = getAccessToken();
            if (!accessToken) {
                const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=playlist-read-private streaming user-read-playback-state user-modify-playback-state`;
                // For iOS, open in same tab to avoid popup issues
                window.location.href = authUrl;
            } else {
                loadSpotifySDK();
            }
        }
    }
    
    function loadSpotifySDK() {
        if (window.Spotify) {
            console.log("Spotify Web Playback SDK is already available.");
            initializePlayer();
            return;
        }
        
        console.log("Loading Spotify Web Playback SDK...");
        const script = document.createElement("script");
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
        
        script.onload = () => {
            console.log("Spotify Web Playback SDK loaded successfully.");
        };
        
        script.onerror = () => {
            console.error("Failed to load Spotify Web Playback SDK.");
            if (isIOS()) {
                showError("Failed to load Spotify player. Please try refreshing the page.");
            }
        };
        
        document.head.appendChild(script);
        
        window.onSpotifyWebPlaybackSDKReady = () => {
            console.log("Spotify Web Playback SDK is ready to initialize.");
            initializePlayer();
        };
    }

    function initializePlayer() {
        console.log("Initializing Spotify Player...");
    
        const token = getAccessToken();
        if (!token) {
            console.error("No Spotify access token found.");
            showError("Authentication failed. Please refresh the page.");
            return;
        }
    
        player = new Spotify.Player({
            name: "Spotify Song Guesser",
            getOAuthToken: cb => { cb(token); },
            volume: 0.5
        });
    
        player.addListener("ready", async ({ device_id }) => {
            console.log(`Player is ready. Device ID: ${device_id}`);
    
            if (device_id) {
                deviceId = device_id;
                localStorage.setItem("spotify_device_id", deviceId);
                await transferPlaybackToDevice(deviceId, token);
            }
        });
    
        player.addListener("not_ready", ({ device_id }) => {
            console.warn(`Device ID has gone offline: ${device_id}`);
        });
    
        player.addListener("initialization_error", ({ message }) => {
            console.error(`Initialization Error: ${message}`);
            showError(`Player initialization failed: ${message}`);
        });
    
        player.addListener("authentication_error", ({ message }) => {
            console.error(`Authentication Error: ${message}`);
            showError("Authentication expired. Please refresh the page.");
        });
    
        player.addListener("account_error", ({ message }) => {
            console.error(`Account Error: ${message}`);
            showError(`Account error: ${message}`);
        });
    
        player.addListener("playback_error", ({ message }) => {
            console.error(`Playback Error: ${message}`);
            showError(`Playback error: ${message}`);
        });
    
        player.connect().then(success => {
            if (!success) {
                console.error("Failed to connect player.");
                showError("Failed to connect to Spotify. Please refresh the page.");
            }
        });
    }
        
    async function transferPlaybackToDevice(deviceId, token) {
        try {
            const response = await fetch(`https://api.spotify.com/v1/me/player`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    device_ids: [deviceId],
                    play: true
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to transfer playback (${response.status})`);
            }
        } catch (error) {
            console.error("Error transferring playback to device:", error);
            if (isIOS()) {
                showError("Playback transfer failed. Try pausing music in the Spotify app first.");
            }
        }
    }
    
    function resetGameState() {
        playlistTracks = [];
        currentTrack = null;
        gameSection.classList.add('hidden');
        playlistInput.classList.remove('hidden');
        songInfo.classList.add('hidden');
        revealBtn.classList.add('hidden');
        nextSongBtn.classList.add('hidden');
        playerStatus.classList.add('hidden');
    }
    
    function loadPlaylist() {
        const url = playlistUrlInput.value.trim();
        const playlistRegex = /playlist\/([a-zA-Z0-9]+)/;
        const match = url.match(playlistRegex);
        
        if (!match) {
            showError('Please enter a valid Spotify playlist URL');
            return;
        }
        
        playlistId = match[1];
        fetchPlaylistTracks();
    }
    
    async function fetchPlaylistTracks() {
        try {
            const token = getAccessToken();
            if (!token) {
                throw new Error('Authentication required. Please refresh the page.');
            }
            if (!playlistId) {
                throw new Error('Invalid playlist URL');
            }

            // Add cache-busting parameter for iOS
            const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?timestamp=${Date.now()}`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                },
                mode: 'cors'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `Spotify API Error (${response.status})`);
            }

            const data = await response.json();
            playlistTracks = data.items
                .map(item => item.track)
                .filter(track => track && track.id);

            if (playlistTracks.length === 0) {
                throw new Error('Playlist contains no playable tracks');
            }

            playlistInput.classList.add('hidden');
            gameSection.classList.remove('hidden');
            playRandomSong();
            
        } catch (error) {
            console.error('API Error:', error);
            
            let errorMessage = error.message;
            
            if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Network error. Please check your connection.';
            } else if (error.message.includes('401')) {
                errorMessage = 'Session expired. Please refresh the page.';
            } else if (error.message.includes('403')) {
                errorMessage = 'Access denied. Please check your permissions.';
            }
            
            showError(errorMessage);
        }
    }
        
    async function playRandomSong() {
        if (playlistTracks.length === 0 || !deviceId) return;
        
        const randomIndex = Math.floor(Math.random() * playlistTracks.length);
        currentTrack = playlistTracks[randomIndex];
        
        try {
            const token = getAccessToken();
            
            // First ensure playback is on our device
            await fetch(`https://api.spotify.com/v1/me/player`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    device_ids: [deviceId],
                    play: false // Don't start playing yet
                })
            });
            
            // Then play the specific track
            await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    uris: [`spotify:track:${currentTrack.id}`],
                    position_ms: 0
                })
            });
            
            revealBtn.classList.remove('hidden');
        } catch (error) {
            console.error('Playback error:', error);
            showError('Failed to play track. Please try again.');
        }
        
        songInfo.classList.add('hidden');
        nextSongBtn.classList.add('hidden');
    }
    
    function revealSong() {
        if (!currentTrack) return;
        
        artistSpan.textContent = currentTrack.artists.map(a => a.name).join(', ');
        yearSpan.textContent = currentTrack.album.release_date.split('-')[0];
        songNameSpan.textContent = currentTrack.name;
        
        songInfo.classList.remove('hidden');
        revealBtn.classList.add('hidden');
        nextSongBtn.classList.remove('hidden');
    }
});