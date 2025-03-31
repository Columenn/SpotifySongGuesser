document.addEventListener('DOMContentLoaded', function() {
    // Spotify API Config (Replace these!)
    const clientId = '9a32bf6e17ca48aeb3c4492943d58d97'; // Get from Spotify Dashboard
    const redirectUri = 'https://columenn.github.io/SpotifySongGuesser/'; // Must match GitHub Pages URL
    
    let accessToken = null;
    let playlistId = null;
    let playlistTracks = [];
    let currentTrack = null;
    
    // DOM Elements
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
    
    // Event Listeners
    loadPlaylistBtn.addEventListener('click', loadPlaylist);
    revealBtn.addEventListener('click', revealSong);
    nextSongBtn.addEventListener('click', playRandomSong);
    
    // Check for access token in URL (from Spotify redirect)
    function checkAuth() {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const token = params.get('access_token');
        
        if (token) {
            accessToken = token;
            // Clean up URL (remove token from address bar)
            window.history.pushState({}, document.title, window.location.pathname);
            playlistInput.classList.remove('hidden');
        } else if (!accessToken) {
            // Redirect to Spotify auth (Implicit Grant Flow)
            const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=playlist-read-private`;
            window.location.href = authUrl;
        }
    }
    
    // Load playlist from URL input
    function loadPlaylist() {
        const url = playlistUrlInput.value.trim();
        const playlistRegex = /playlist\/([a-zA-Z0-9]+)/;
        const match = url.match(playlistRegex);
        
        if (!match) {
            alert('Please enter a valid Spotify playlist URL (e.g., https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M)');
            return;
        }
        
        playlistId = match[1];
        fetchPlaylistTracks();
    }
    
    // Fetch tracks from the playlist
    async function fetchPlaylistTracks() {
        try {
            const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch playlist (HTTP ${response.status})`);
            }
            
            const data = await response.json();
            playlistTracks = data.items
                .map(item => item.track)
                .filter(track => track && track.id); // Filter out null tracks
            
            if (playlistTracks.length === 0) {
                throw new Error('Playlist is empty or contains no playable tracks');
            }
            
            // Show game UI
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
        
        // Update Spotify player embed
        spotifyPlayer.src = `https://open.spotify.com/embed/track/${currentTrack.id}?utm_source=generator`;
        
        // Reset UI
        songInfo.classList.add('hidden');
        revealBtn.classList.remove('hidden');
        nextSongBtn.classList.add('hidden');
    }
    
    // Reveal song details
    function revealSong() {
        if (!currentTrack) return;
        
        // Extract artist names
        const artists = currentTrack.artists.map(artist => artist.name).join(', ');
        
        // Extract features
        const features = [];
        if (currentTrack.popularity) features.push(`Popularity: ${currentTrack.popularity}/100`);
        if (currentTrack.duration_ms) {
            const minutes = Math.floor(currentTrack.duration_ms / 60000);
            const seconds = ((currentTrack.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0');
            features.push(`Duration: ${minutes}:${seconds}`);
        }
        
        // Extract year from release date
        let year = 'Unknown';
        if (currentTrack.album?.release_date) {
            year = currentTrack.album.release_date.split('-')[0];
        }
        
        // Update UI
        artistSpan.textContent = artists;
        featuresSpan.textContent = features.join(' • ');
        yearSpan.textContent = year;
        songNameSpan.textContent = currentTrack.name;
        
        // Show details
        songInfo.classList.remove('hidden');
        revealBtn.classList.add('hidden');
        nextSongBtn.classList.remove('hidden');
    }
});