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
    const playPauseBtn = document.getElementById('play-pause-btn');
    const playPauseIcon = document.getElementById('play-pause-icon');
    const volumeSlider = document.getElementById('volume-slider');
    
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
                playPauseBtn.disabled = false;
            }
        });
    
        player.addListener("not_ready", ({ device_id }) => {
            console.warn(`Device ID has gone offline: ${device_id}`);
        });
    
        player.addListener("initialization_error", ({ message }) => console.error(`Initialization Error: ${message}`));
        player.addListener("authentication_error", ({ message }) => console.error(`Authentication Error: ${message}`));
        player.addListener("account_error", ({ message }) => console.error(`Account Error: ${message}`));
        player.addListener("playback_error", ({ message }) => console.error(`Playback Error: ${message}`));
        
        player.addListener('player_state_changed', state => {
            if (!state) return;
            playPauseIcon.textContent = state.paused ? '▶' : '❚❚';
        });
    
        player.connect().then(success => {
            if (!success) {
                console.error("Failed to connect player.");
            }
        });
        
        setupPlayerControls();
    }
    
    function setupPlayerControls() {
        volumeSlider.addEventListener('input', function() {
            if (player) {
                player.setVolume(parseFloat(this.value)).then(() => {
                    console.log('Volume updated to', this.value);
                });
            }
        });

        playPauseBtn.addEventListener('click', function() {
            if (player) {
                player.togglePlay().then(() => {
                    console.log('Playback toggled');
                });
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
        playPauseBtn.disabled = true;
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
            if (!accessToken || accessToken === 'undefined') {
                throw new Error('No valid access token found. Please refresh the page to reauthenticate.');
            }
    
            if (!playlistId || !/^[a-zA-Z0-9]+$/.test(playlistId)) {
                throw new Error('Invalid playlist ID format. Please check the playlist URL.');
            }
    
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
    
            if (!response.ok) {
                let errorDetails = '';
                try {
                    const errorData = await response.json();
                    errorDetails = errorData.error?.message || '';
                    if (errorData.error?.status === 403) {
                        errorDetails += ' - Make sure the playlist is not private';
                    }
                } catch (e) {
                    console.error('Error parsing error response:', e);
                }
                
                throw new Error(`Spotify API request failed (Status: ${response.status})${errorDetails ? ': ' + errorDetails : ''}`);
            }
            
            const data = await response.json();
            playlistTracks = data.items
                .map(item => item.track)
                .filter(track => track && track.id);
            
            if (playlistTracks.length === 0) {
                throw new Error('Playlist is empty or contains no playable tracks. Note: Podcast episodes are not supported.');
            }
            
            playlistInput.classList.add('hidden');
            gameSection.classList.remove('hidden');
            playRandomSong();
        } catch (error) {
            console.error('Detailed error:', error);
            
            let errorMessage = 'An error occurred while loading the playlist';
            
            if (error.name === 'AbortError') {
                errorMessage = 'Request timed out. The Spotify servers might be slow or your connection might be unstable.';
            } else if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Network error. This could mean:';
                errorMessage += '\n1. Spotify API is temporarily unavailable';
                errorMessage += '\n2. Your network is blocking the request';
                errorMessage += '\n3. There\'s a CORS issue (try refreshing)';
                errorMessage += '\n4. Your ad blocker might be interfering';
            } else if (error.message.includes('401')) {
                errorMessage = 'Authentication expired. Please refresh the page to get a new access token.';
            } else if (error.message.includes('invalid playlist')) {
                errorMessage = 'Invalid playlist URL. Make sure you\'re using a valid Spotify playlist link.';
            } else {
                errorMessage = error.message;
            }
            
            alert(`Error: ${errorMessage}\n\nIf the problem persists, try:\n1. Refreshing the page\n2. Checking Spotify's status at status.spotify.com\n3. Trying a different playlist`);
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
            playPauseBtn.disabled = false;
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