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
    
    function checkAuth() {
        resetGameState();
        
        const params = new URLSearchParams(window.location.hash.substring(1));
        const token = params.get('access_token');
        
        if (token) {
            accessToken = token;
            localStorage.setItem("spotify_access_token", token);
            window.history.pushState({}, document.title, window.location.pathname);
            loadSpotifySDK();
        } else if (!accessToken) {
            const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=playlist-read-private streaming user-read-playback-state user-modify-playback-state`;
            window.location.href = authUrl;
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
        };
        
        document.head.appendChild(script);
        
        window.onSpotifyWebPlaybackSDKReady = () => {
            console.log("Spotify Web Playback SDK is ready to initialize.");
            initializePlayer();
        };
    }

    function initializePlayer() {
        console.log("Initializing Spotify Player...");
    
        const token = localStorage.getItem("spotify_access_token");
        if (!token) {
            console.error("No Spotify access token found.");
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
    
        player.addListener("initialization_error", ({ message }) => console.error(`Initialization Error: ${message}`));
        player.addListener("authentication_error", ({ message }) => console.error(`Authentication Error: ${message}`));
        player.addListener("account_error", ({ message }) => console.error(`Account Error: ${message}`));
        player.addListener("playback_error", ({ message }) => console.error(`Playback Error: ${message}`));
    
        player.connect().then(success => {
            if (!success) {
                console.error("Failed to connect player.");
            }
        });
    }
        
    function transferPlaybackToDevice(deviceId, token) {
        return fetch(`https://api.spotify.com/v1/me/player`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                device_ids: [deviceId],
                play: true
            })
        }).catch(error => console.error("Error transferring playback to device:", error));
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
            alert('Please enter a valid Spotify playlist URL');
            return;
        }
        
        playlistId = match[1];
        fetchPlaylistTracks();
    }
    
    async function fetchPlaylistTracks() {
        try {
            // First verify we have a valid access token
            if (!accessToken || accessToken === 'undefined') {
                throw new Error('Authentication required. Please refresh the page.');
            }
    
            // Additional iOS-specific checks
            const isAppleDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                                 (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            
            if (isAppleDevice) {
                // Check for potential ITP issues
                if (!document.cookie.includes('sp_')) {
                    console.warn('No Spotify cookies detected - ITP might be blocking');
                }
            }
    
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // Longer timeout for iOS
            
            // Modified request with additional headers for Apple devices
            const headers = {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            };
    
            if (isAppleDevice) {
                headers['Accept'] = 'application/json';
                headers['Cache-Control'] = 'no-cache';
            }
    
            const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
                headers: headers,
                signal: controller.signal,
                credentials: isAppleDevice ? 'include' : 'same-origin', // Handle cookies differently for Apple
                mode: 'cors'
            });
            
            clearTimeout(timeoutId);
    
            if (!response.ok) {
                let errorDetails = '';
                try {
                    const errorData = await response.json();
                    errorDetails = errorData.error?.message || '';
                    
                    // Special handling for Apple devices
                    if (isAppleDevice && response.status === 403) {
                        errorDetails += '\n\nApple Device Detected: This might be caused by:';
                        errorDetails += '\n1. Intelligent Tracking Prevention (ITP) blocking the request';
                        errorDetails += '\n2. Cookie restrictions in Safari/Firefox on iOS';
                        errorDetails += '\n3. Missing required headers';
                        
                        // Suggest potential workarounds
                        errorDetails += '\n\nTry these solutions:';
                        errorDetails += '\n1. Open in Chrome (if available)';
                        errorDetails += '\n2. Disable "Prevent Cross-Site Tracking" in Safari Settings';
                        errorDetails += '\n3. Try in Private Browsing mode';
                    }
                } catch (e) {
                    console.error('Error parsing error response:', e);
                }
                
                throw new Error(`Spotify API request failed (Status: ${response.status})${errorDetails ? ': ' + errorDetails : ''}`);
            }
            
            // Rest of your success handling code...
            
        } catch (error) {
            console.error('Full error details:', error);
            
            let errorMessage = 'Failed to load playlist';
            
            if (error.message.includes('403')) {
                errorMessage = 'Access denied by Spotify (403 Forbidden)\n';
                
                if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
                    errorMessage += '\nThis error occurs frequently on Apple devices due to:';
                    errorMessage += '\n- Strict privacy protections in iOS/iPadOS';
                    errorMessage += '\n- Cookie restrictions in mobile browsers';
                    errorMessage += '\n\nPossible solutions:';
                    errorMessage += '\n1. Try Chrome browser if available';
                    errorMessage += '\n2. Go to Settings > Safari and turn OFF "Prevent Cross-Site Tracking"';
                    errorMessage += '\n3. Clear website data in Safari settings';
                    errorMessage += '\n4. Try requesting desktop site (long press refresh button)';
                }
            }
            
            alert(errorMessage);
            
            // Additional debugging for developers
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('Debug info:', {
                    accessToken: accessToken ? 'exists' : 'missing',
                    playlistId,
                    userAgent: navigator.userAgent,
                    cookies: document.cookie,
                    isAppleDevice
                });
            }
        }
    }
    
    async function playRandomSong() {
        if (playlistTracks.length === 0 || !deviceId) return;
        
        const randomIndex = Math.floor(Math.random() * playlistTracks.length);
        currentTrack = playlistTracks[randomIndex];
        
        try {
            await fetch(`https://api.spotify.com/v1/me/player`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    device_ids: [deviceId],
                    play: true
                })
            });
            
            await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    uris: [`spotify:track:${currentTrack.id}`]
                })
            });
            
            revealBtn.classList.remove('hidden');
        } catch (error) {
            console.error('Playback error:', error);
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