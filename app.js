document.addEventListener('DOMContentLoaded', function() {
    // Spotify API Config
    const clientId = '9a32bf6e17ca48aeb3c4492943d58d97';
    const redirectUri = 'https://columenn.github.io/SpotifySongGuesser/';
    
    let accessToken = null;
    let playlistId = null;
    let playlistTracks = [];
    let currentTrack = null;
    let isPlaying = false;
    
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
        } else if (!accessToken) {
            const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=playlist-read-private`;
            window.location.href = authUrl;
        }
    }
    
    function resetGameState() {
        playlistTracks = [];
        currentTrack = null;
        isPlaying = false;
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
                throw new Error('No valid access token found. Please refresh the page to reauthenticate.');
            }
    
            // Verify playlist ID format
            if (!playlistId || !/^[a-zA-Z0-9]+$/.test(playlistId)) {
                throw new Error('Invalid playlist ID format. Please check the playlist URL.');
            }
    
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
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
    
    function playRandomSong() {
        if (playlistTracks.length === 0) return;
        
        const randomIndex = Math.floor(Math.random() * playlistTracks.length);
        currentTrack = playlistTracks[randomIndex];
        isPlaying = false;
        
        // Try to open in Spotify app
        window.location.href = `spotify:track:${currentTrack.id}`;
        
        // Fallback to web player if needed
        setTimeout(() => {
            if (!isPlaying) {
                window.open(`https://open.spotify.com/track/${currentTrack.id}`, '_blank');
            }
        }, 500);
        
        playerStatus.textContent = "Playing...";
        playerStatus.classList.remove('hidden');
        revealBtn.classList.remove('hidden');
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
    
    // Listen for visibility changes to detect if Spotify app opened
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            isPlaying = true;
        }
    });
});