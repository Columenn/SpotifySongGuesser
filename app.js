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
        player.addListener("authentication_error", ({ message }) => {
            console.error(`Authentication Error: ${message}`);
            alert(`Authentication error: ${message}`);
        });
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
            // Basic validation
            if (!accessToken) throw new Error('Authentication required. Please refresh the page.');
            if (!playlistId) throw new Error('Invalid playlist URL');
    
            // Platform detection (for error messages only)
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            
            console.log('AccessToken:', accessToken);  // Debugging line
            console.log('PlaylistId:', playlistId);    // Debugging line
    
            const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'  // Include cookies in the request
            });
    
            if (!response.ok) {
                let errorDetails = '';
                try {
                    const errorData = await response.json();
                    errorDetails = errorData.error?.message || '';
                    
                    // Special iOS messaging
                    if (isIOS && response.status === 403) {
                        errorDetails += '\n\niOS Detected: Common fixes:\n' +
                                       '1. Try Chrome browser\n' +
                                       '2. Disable "Prevent Cross-Site Tracking" in Safari Settings\n' +
                                       '3. Clear website data (Settings > Safari)';
                    }
                } catch (e) {
                    console.error('Error parsing response:', e);
                }
                
                throw new Error(`Spotify API Error (${response.status})${errorDetails ? ': ' + errorDetails : ''}`);
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
    
            // Enhance network error messages
            if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Network error. Please check your connection';
            }
    
            // For iOS 403 errors, provide specific guidance
            if (isIOS && error.message.includes('403')) {
                errorMessage = 'iOS Access Error (403)\n' +
                              'This often works:\n' +
                              '1. Open in Chrome\n' +
                              '2. Go to Settings > Safari and turn OFF "Prevent Cross-Site Tracking"\n' +
                              '3. Clear Safari website data';
            }
            
            alert(errorMessage);
        }
    }
        
    // Check if the device is iOS
    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent);
    }

    async function playRandomSong() {
        if (playlistTracks.length === 0) return;
        
        const randomIndex = Math.floor(Math.random() * playlistTracks.length);
        currentTrack = playlistTracks[randomIndex];
        
        try {
            // Check if the user can play using the Spotify app (using the Spotify URI scheme)
            const spotifyUri = `spotify:track:${currentTrack.id}`;
            
            if (isIOS()) {
                // Attempt to open the Spotify app on iOS
                window.location.href = spotifyUri;
            } else if (/Android/.test(navigator.userAgent)) {
                // Attempt to open Spotify app on Android
                window.location.href = spotifyUri;
            } else {
                // For other devices (e.g., desktops), use Web Playback SDK or fallback
                playWithWebSDK();
            }
        } catch (error) {
            console.error('Playback error:', error);
        }

        songInfo.classList.add('hidden');
        nextSongBtn.classList.add('hidden');
    }

    async function playWithWebSDK() {
        if (!deviceId) return;
        
        try {
            // Ensure you're making requests from a server-side environment to avoid CORS issues
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
