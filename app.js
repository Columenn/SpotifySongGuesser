document.addEventListener('DOMContentLoaded', function() {
    // Spotify API Config
    const clientId = '9a32bf6e17ca48aeb3c4492943d58d97';
    const redirectUri = window.location.href.split('?')[0];
    
    // DOM Elements
    const loginBtn = document.getElementById('login-btn');
    const authSection = document.getElementById('auth-section');
    const gameSection = document.getElementById('game-section');
    const statusDiv = document.getElementById('status');
    const revealBtn = document.getElementById('reveal-btn');
    const songInfo = document.getElementById('song-info');
    const artistSpan = document.getElementById('artist');
    const yearSpan = document.getElementById('year');
    const songNameSpan = document.getElementById('song-name');
    
    let accessToken = null;
    let currentTrack = null;
    let currentTrackId = null;
    let checkInterval = null;
    let hideTimeout = null;
    let isShowingInfo = false;
    
    // Initialize
    checkAuth();
    
    // Event Listeners
    loginBtn.addEventListener('click', () => {
        const authUrl = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user-read-currently-playing`;
        window.location.href = authUrl;
    });
    
    revealBtn.addEventListener('click', revealSong);
    
    function checkAuth() {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const token = params.get('access_token');
        
        if (token) {
            accessToken = token;
            localStorage.setItem("spotify_access_token", token);
            window.history.pushState({}, document.title, window.location.pathname);
            startMonitoring();
        } else {
            accessToken = localStorage.getItem("spotify_access_token");
            if (accessToken) {
                startMonitoring();
            }
        }
    }
    
    function startMonitoring() {
        authSection.classList.add('hidden');
        gameSection.classList.remove('hidden');
        
        // Check every 2 seconds for currently playing track
        checkInterval = setInterval(checkCurrentlyPlaying, 2000);
        checkCurrentlyPlaying();
    }
    
    async function checkCurrentlyPlaying() {
        try {
            const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (response.status === 200) {
                const data = await response.json();
                if (data.is_playing && data.item) {
                    // If track changed, reset the UI
                    if (currentTrackId && data.item.id !== currentTrackId) {
                        isShowingInfo = false;
                        songInfo.classList.add('hidden');
                    }
                    
                    currentTrack = data.item;
                    currentTrackId = data.item.id;
                    statusDiv.textContent = "Song detected!";
                    
                    // Only show reveal button if we're not currently showing info
                    if (!isShowingInfo) {
                        revealBtn.classList.remove('hidden');
                    }
                } else {
                    statusDiv.textContent = "No song currently playing";
                    revealBtn.classList.add('hidden');
                    songInfo.classList.add('hidden');
                    isShowingInfo = false;
                }
            } else if (response.status === 204) {
                statusDiv.textContent = "No song currently playing";
                revealBtn.classList.add('hidden');
                songInfo.classList.add('hidden');
                isShowingInfo = false;
            } else if (response.status === 401) {
                // Token expired
                clearInterval(checkInterval);
                if (hideTimeout) clearTimeout(hideTimeout);
                localStorage.removeItem("spotify_access_token");
                accessToken = null;
                authSection.classList.remove('hidden');
                gameSection.classList.add('hidden');
                statusDiv.textContent = "Session expired. Please login again.";
            }
        } catch (error) {
            console.error("Error checking currently playing:", error);
            statusDiv.textContent = "Error checking playback status";
        }
    }
    
    function revealSong() {
        if (!currentTrack) return;
        
        // Clear any existing timeout
        if (hideTimeout) clearTimeout(hideTimeout);
        
        // Show the song info and hide reveal button
        artistSpan.textContent = currentTrack.artists.map(a => a.name).join(', ');
        yearSpan.textContent = currentTrack.album.release_date.split('-')[0];
        songNameSpan.textContent = currentTrack.name;
        
        songInfo.classList.remove('hidden');
        revealBtn.classList.add('hidden');
        isShowingInfo = true;
        
        // Set timeout as fallback (10 seconds)
        hideTimeout = setTimeout(() => {
            songInfo.classList.add('hidden');
            isShowingInfo = false;
            // Only show reveal button if it's the same song
            if (currentTrackId === currentTrack?.id) {
                revealBtn.classList.remove('hidden');
            }
        }, 10000);
    }
});