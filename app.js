document.addEventListener('DOMContentLoaded', function () {
    const clientId = '9a32bf6e17ca48aeb3c4492943d58d97';
    const redirectUri = 'https://columenn.github.io/SpotifySongGuesser/';
    let accessToken = null;
    let playlistId = null;
    let playlistTracks = [];
    let currentTrack = null;
    
    // DOM Elements
    const playlistUrlInput = document.getElementById('playlist-url');
    const loadPlaylistBtn = document.getElementById('load-playlist');
    const gameSection = document.getElementById('game-section');
    const revealBtn = document.getElementById('reveal-btn');
    const songInfo = document.getElementById('song-info');
    const artistSpan = document.getElementById('artist');
    const yearSpan = document.getElementById('year');
    const songNameSpan = document.getElementById('song-name');
    const nextSongBtn = document.getElementById('next-song');
    const embedContainer = document.getElementById('spotify-embed-container');
    
    checkAuth();
    
    loadPlaylistBtn.addEventListener('click', loadPlaylist);
    revealBtn.addEventListener('click', revealSong);
    nextSongBtn.addEventListener('click', playRandomSong);
    
    function checkAuth() {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const token = params.get('access_token');
        
        if (token) {
            accessToken = token;
            localStorage.setItem('spotify_access_token', token);
            window.history.pushState({}, document.title, window.location.pathname);
        } else {
            const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=playlist-read-private`;
            window.location.href = authUrl;
        }
    }
    
    function loadPlaylist() {
        const url = playlistUrlInput.value.trim();
        const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
        
        if (!match) {
            alert('Please enter a valid Spotify playlist URL');
            return;
        }
        
        playlistId = match[1];
        fetchPlaylistTracks();
    }
    
    async function fetchPlaylistTracks() {
        try {
            if (!accessToken) {
                throw new Error('No valid access token found. Please refresh the page to reauthenticate.');
            }
            
            const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch playlist tracks');
            }
            
            const data = await response.json();
            playlistTracks = data.items.map(item => item.track).filter(track => track && track.id);
            
            if (playlistTracks.length === 0) {
                throw new Error('Playlist is empty or contains no playable tracks.');
            }
            
            gameSection.classList.remove('hidden');
            playRandomSong();
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    }
    
    function playRandomSong() {
        if (playlistTracks.length === 0) return;
        
        const randomIndex = Math.floor(Math.random() * playlistTracks.length);
        currentTrack = playlistTracks[randomIndex];
        
        embedContainer.innerHTML = `<iframe src="https://open.spotify.com/embed/track/${currentTrack.id}?autoplay=1" width="0" height="0" style="display:none;"></iframe>`;
        
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
});
