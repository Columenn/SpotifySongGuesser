document.addEventListener('DOMContentLoaded', function() {
    const clientId = '9a32bf6e17ca48aeb3c4492943d58d97'; // Replace with your Spotify Client ID
    const redirectUri = 'http://localhost:8000'; // Must match your Spotify app settings
    
    let accessToken = null;
    let playlistId = null;
    let playlistTracks = [];
    let currentTrack = null;
    
    // DOM elements
    const playlistInput = document.getElementById('playlist-input');
    const playlistUrlInput = document.getElementById('playlist-url');
    const loadPlaylistBtn = document.getElementById('load-playlist');
    const gameSection = document.getElementById('game-section');
    const spotifyPlayer = document.getElementById('spotify-player');
    const revealBtn = document.getElementById('reveal-btn');
    const songInfo = document.getElementById('song-info');
    const artistSpan = document.getElementById('artist');
    const featuresSpan = document.getElementById('features');
    const yearSpan = document.getElementById('year');
    const songNameSpan = document.getElementById('song-name');
    const nextSongBtn = document.getElementById('next-song');
    
    // Initialize the app
    checkAuth();
    
    // Event listeners
    loadPlaylistBtn.addEventListener('click', loadPlaylist);
    revealBtn.addEventListener('click', revealSong);
    nextSongBtn.addEventListener('click', playRandomSong);
    
    // Check if we have an access token in the URL (from Spotify auth redirect)
    function checkAuth() {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const token = params.get('access_token');
        
        if (token) {
            accessToken = token;
            window.history.pushState({}, document.title, window.location.pathname);
            playlistInput.classList.remove('hidden');
        } else if (!accessToken) {
            // If no token, redirect to Spotify auth
            const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=playlist-read-private`;
            window.location.href = authUrl;
        }
    }
    
    // Load playlist from URL
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
    
    // Fetch all tracks from the playlist
    async function fetchPlaylistTracks() {
        try {
            const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch playlist');
            }
            
            const data = await response.json();
            playlistTracks = data.items.map(item => item.track).filter(track => track !== null);
            
            if (playlistTracks.length === 0) {
                throw new Error('Playlist is empty');
            }
            
            playlistInput.classList.add('hidden');
            gameSection.classList.remove('hidden');
            playRandomSong();
        } catch (error) {
            console.error('Error:', error);
            alert('Error loading playlist: ' + error.message);
        }
    }
    
    // Play a random song from the playlist
    function playRandomSong() {
        if (playlistTracks.length === 0) return;
        
        const randomIndex = Math.floor(Math.random() * playlistTracks.length);
        currentTrack = playlistTracks[randomIndex];
        
        // Update player
        spotifyPlayer.src = `https://open.spotify.com/embed/track/${currentTrack.id}?utm_source=generator`;
        
        // Reset UI
        songInfo.classList.add('hidden');
        revealBtn.classList.remove('hidden');
        nextSongBtn.classList.add('hidden');
    }
    
    // Reveal song information
    function revealSong() {
        if (!currentTrack) return;
        
        // Extract artist names
        const artists = currentTrack.artists.map(artist => artist.name).join(', ');
        
        // Extract features (simplified - in a real app you might want more detailed audio features)
        const features = [];
        if (currentTrack.popularity) features.push(`Popularity: ${currentTrack.popularity}`);
        if (currentTrack.duration_ms) {
            const minutes = Math.floor(currentTrack.duration_ms / 60000);
            const seconds = ((currentTrack.duration_ms % 60000) / 1000).toFixed(0);
            features.push(`Duration: ${minutes}:${seconds.padStart(2, '0')}`);
        }
        
        // Extract year from release date
        let year = 'Unknown';
        if (currentTrack.album && currentTrack.album.release_date) {
            year = currentTrack.album.release_date.split('-')[0];
        }
        
        // Update UI
        artistSpan.textContent = artists;
        featuresSpan.textContent = features.join(' • ');
        yearSpan.textContent = year;
        songNameSpan.textContent = currentTrack.name;
        
        songInfo.classList.remove('hidden');
        revealBtn.classList.add('hidden');
        nextSongBtn.classList.remove('hidden');
    }
});