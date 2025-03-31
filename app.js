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
            window.history.pushState({}, document.title, window.location.pathname);
            initializePlayer();
            playlistInput.classList.remove('hidden');
        } else if (!accessToken) {
            const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=playlist-read-private streaming user-read-playback-state user-modify-playback-state`;
            window.location.href = authUrl;
        }
    }
    
    function initializePlayer() {
        console.log("Initializing Spotify Web Playback SDK...");
    
        if (!window.Spotify) {
            console.error("Spotify Web Playback SDK is not available yet!");
            return;
        }
    
        window.onSpotifyWebPlaybackSDKReady = () => {
            console.log("Spotify Web Playback SDK is ready.");
    
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
                    await transferPlaybackToDevice(deviceId, token);  // Ensure Spotify uses this device
                    playerStatus.textContent = "Player connected";
                } else {
                    console.error("Device ID is null.");
                    playerStatus.textContent = "Device not ready.";
                }
            });
    
            player.addListener("not_ready", ({ device_id }) => {
                playerStatus.textContent = "Player offline";
                console.warn(`Device ID has gone offline: ${device_id}`);
            });
    
            player.addListener("initialization_error", ({ message }) => console.error(`Initialization Error: ${message}`));
            player.addListener("authentication_error", ({ message }) => console.error(`Authentication Error: ${message}`));
            player.addListener("account_error", ({ message }) => console.error(`Account Error: ${message}`));
            player.addListener("playback_error", ({ message }) => console.error(`Playback Error: ${message}`));
    
            player.connect().then(success => {
                if (success) {
                    console.log("Successfully connected to Spotify.");
                } else {
                    console.error("Failed to connect player.");
                    playerStatus.textContent = "Failed to connect player.";
                }
            });
        };
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
        }).then(response => response.json())
          .catch(error => console.error("Error transferring playback to device:", error));
    }
    
    function resetGameState() {
        playlistTracks = [];
        currentTrack = null;
        if (gameSection) gameSection.classList.add('hidden');
        if (playlistInput) playlistInput.classList.remove('hidden');
        if (songInfo) songInfo.classList.add('hidden');
        if (revealBtn) revealBtn.classList.add('hidden');
        if (nextSongBtn) nextSongBtn.classList.add('hidden');
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
            const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (!response.ok) throw new Error('Failed to fetch playlist');
            
            const data = await response.json();
            playlistTracks = data.items
                .map(item => item.track)
                .filter(track => track && track.id);
            
            if (playlistTracks.length === 0) {
                throw new Error('Playlist is empty');
            }
            
            playlistInput.classList.add('hidden');
            gameSection.classList.remove('hidden');
            playRandomSong();
        } catch (error) {
            console.error('Error:', error);
            alert('Error: ' + error.message);
        }
    }
    
    async function playRandomSong() {
        if (playlistTracks.length === 0 || !deviceId) return;
        
        const randomIndex = Math.floor(Math.random() * playlistTracks.length);
        currentTrack = playlistTracks[randomIndex];
        
        try {
            // Transfer playback to our player if needed
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
            
            // Start playback
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
            
            playerStatus.textContent = "Now playing...";
        } catch (error) {
            console.error('Playback error:', error);
            playerStatus.textContent = "Error starting playback - make sure Spotify is open";
        }
        
        // Reset UI
        songInfo.classList.add('hidden');
        revealBtn.classList.remove('hidden');
        nextSongBtn.classList.add('hidden');
    }
    
    function revealSong() {
        if (!currentTrack) return;
        
        // Set song info
        artistSpan.textContent = currentTrack.artists.map(a => a.name).join(', ');
        yearSpan.textContent = currentTrack.album.release_date.split('-')[0];
        songNameSpan.textContent = currentTrack.name;
        
        // Update UI
        songInfo.classList.remove('hidden');
        revealBtn.classList.add('hidden');
        nextSongBtn.classList.remove('hidden');
    }
});