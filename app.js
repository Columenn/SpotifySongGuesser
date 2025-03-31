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
        
        // More flexible URL parsing
        let playlistId = null;
        
        // Try different URL formats
        const patterns = [
            /playlist\/([a-zA-Z0-9]+)/,         // Standard URL
            /spotify:playlist:([a-zA-Z0-9]+)/,  // URI format
            /^([a-zA-Z0-9]+)$/                  // Just the ID
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                playlistId = match[1];
                break;
            }
        }
        
        if (!playlistId) {
            alert('Please enter a valid Spotify playlist URL or ID');
            return;
        }
        
        playlistId = playlistId;
        fetchPlaylistTracks();
    }
    
    async function fetchPlaylistTracks() {
        try {
            playerStatus.classList.remove('hidden');
            playerStatus.textContent = "Loading playlist...";
            
            const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to fetch playlist');
            }
            
            const data = await response.json();
            playlistTracks = data.items
                .map(item => item.track)
                .filter(track => track && track.id);
            
            if (playlistTracks.length === 0) {
                throw new Error('Playlist is empty or contains no playable tracks');
            }
            
            playlistInput.classList.add('hidden');
            gameSection.classList.remove('hidden');
            playerStatus.classList.add('hidden');
            playRandomSong();
        } catch (error) {
            console.error('Error:', error);
            playerStatus.textContent = "Error: " + error.message;
            setTimeout(() => playerStatus.classList.add('hidden'), 3000);
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
            playerStatus.classList.remove('hidden');
            playerStatus.textContent = "Playback error - try again";
            setTimeout(() => playerStatus.classList.add('hidden'), 2000);
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