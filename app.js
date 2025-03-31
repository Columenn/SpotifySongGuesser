document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("load-playlist").addEventListener("click", checkAuth);
});

function checkAuth() {
    console.log("Checking authentication...");

    const token = localStorage.getItem("spotify_access_token");
    if (!token) {
        console.error("No Spotify access token found.");
        return;
    }

    initializePlayer();
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

        const player = new Spotify.Player({
            name: "Spotify Song Guesser",
            getOAuthToken: cb => { cb(token); },
            volume: 0.5
        });

        player.addListener("ready", async ({ device_id }) => {
            console.log(`Player is ready. Device ID: ${device_id}`);

            if (device_id) {
                localStorage.setItem("spotify_device_id", device_id);
                await transferPlaybackToDevice(device_id, token);  // Ensure Spotify uses this device
            } else {
                console.error("Device ID is null.");
            }
        });

        player.addListener("not_ready", ({ device_id }) => {
            console.warn(`Player is not ready. Device ID: ${device_id}`);
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
            }
        });
    };
}

async function transferPlaybackToDevice(deviceId, token) {
    try {
        const response = await fetch("https://api.spotify.com/v1/me/player", {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                device_ids: [deviceId],
                play: true
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to transfer playback: ${errorData.error.message}`);
        }

        console.log("Playback transferred successfully.");
    } catch (error) {
        console.error("Error transferring playback:", error.message);
    }
}
