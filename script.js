let qrScanner = null;
let deferredPrompt = null;
let player = null;
let deviceId = null;
let accessToken = null;

// Spotify API credentials - VERVANG MET JOUW GEGEVENS!
const clientId = '85e1ab0fea254ea3b5d9d0e1a866238d';
const redirectUri = 'https://geertmendonck.github.io/Fritster/index.html'; // Bijv. 'https://jouwgebruikersnaam.github.io/jouw-repo-naam/index.html'

// DOM Elements
const video = document.getElementById('video');
const scanButton = document.getElementById('scanButton');
const status = document.getElementById('status');
const installPrompt = document.getElementById('installPrompt');
const installButton = document.getElementById('installButton');
const dismissInstall = document.getElementById('dismissInstall');

// Initialisatie van de app bij het laden van de pagina
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupInstallPrompt();
    handleAuthentication();
});

function initializeApp() {
    scanButton.addEventListener('click', toggleScanner);
    scanButton.disabled = true;
    showStatus('Verbinden met Spotify. Eenmalige login nodig.', 'info');
}

// Functie voor authenticatie en tokenbeheer
async function handleAuthentication() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
        try {
            accessToken = await getAccessToken(code);
            console.log("Access Token verkregen:", accessToken);
            window.history.pushState({}, document.title, window.location.pathname);
            initializeSpotifyPlayer(accessToken);
        } catch (error) {
            console.error('Authenticatie mislukt:', error);
            showStatus('Authenticatie mislukt. Probeer opnieuw.', 'error');
        }
    } else {
        redirectToSpotifyAuthorize();
    }
}

async function redirectToSpotifyAuthorize() {
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    localStorage.setItem('code_verifier', codeVerifier);

    const authUrl = new URL("https://accounts.spotify.com/authorize");
    const params = {
        response_type: 'code',
        client_id: clientId,
        scope: 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state',
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        redirect_uri: redirectUri,
    };
    authUrl.search = new URLSearchParams(params).toString();
    window.location.href = authUrl.toString();
}

async function getAccessToken(code) {
    const codeVerifier = localStorage.getItem('code_verifier');
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body
    });

    if (!response.ok) {
        throw new Error('HTTP status ' + response.status);
    }
    const data = await response.json();
    return data.access_token;
}

// Functies voor PKCE
function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// Initialisatie en beheer van de Spotify Web Playback SDK
function initializeSpotifyPlayer(token) {
    window.onSpotifyWebPlaybackSDKReady = () => {
        player = new Spotify.Player({
            name: 'Spotify QR Scanner',
            getOAuthToken: cb => { cb(token); },
            volume: 0.5
        });

        player.addListener('ready', ({ device_id }) => {
            console.log('Ready met Device ID', device_id);
            deviceId = device_id;
            showStatus('Verbonden met Spotify! Klaar om te scannen.', 'success');
            scanButton.disabled = false;
        });

        player.addListener('not_ready', ({ device_id }) => {
            console.log('Apparaat is offline', device_id);
            showStatus('Niet verbonden met Spotify. Apparaat is offline.', 'error');
        });

        player.addListener('initialization_error', ({ message }) => {
            console.error('Initialisatie fout:', message);
            showStatus('Fout bij het initialiseren van de speler.', 'error');
        });

        player.connect();
    };
}

// Scanner functionaliteit
async function toggleScanner() {
    if (qrScanner) {
        stopScanner();
    } else {
        await startScanner();
    }
}

async function startScanner() {
    if (!accessToken || !deviceId) {
        showStatus('Verbind eerst met Spotify...', 'info');
        return;
    }

    try {
        scanButton.disabled = true;
        scanButton.textContent = 'Camera starten...';
        const hasCamera = await QrScanner.hasCamera();
        if (!hasCamera) {
            throw new Error('Geen camera gevonden op dit apparaat');
        }

        qrScanner = new QrScanner(
            video,
            result => handleScanResult(result),
            {
                onDecodeError: error => {},
                highlightScanRegion: true,
                highlightCodeOutline: true,
            }
        );

        await qrScanner.start();

        scanButton.textContent = 'Stop Scannen';
        scanButton.disabled = false;
        showStatus('Camera actief - houd QR-code voor de camera', 'info');

    } catch (error) {
        console.error('Scanner error:', error);
        showStatus(`Fout: ${error.message}`, 'error');
        scanButton.textContent = 'Camera Starten';
        scanButton.disabled = false;
    }
}

function stopScanner() {
    if (qrScanner) {
        qrScanner.stop();
        qrScanner.destroy();
        qrScanner = null;
    }
    scanButton.textContent = 'Camera Starten';
    showStatus('Scanner gestopt', 'info');
}

async function handleScanResult(result) {
    const data = result.data;
    console.log('Gescande data:', data);

    if (isSpotify(data)) {
        stopScanner();
        await playTrack(data);
    } else {
        showStatus('Dit is geen Spotify-code', 'error');
    }
}

function isSpotify(data) {
    return data.includes('spotify.com') || data.includes('spotify:track:');
}

async function playTrack(data) {
    const trackId = data.split(':').pop().split('?')[0];

    try {
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
            method: 'PUT',
            body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
        });
        showStatus('Track wordt afgespeeld in de browser!', 'success');
    } catch (error) {
        console.error('Fout bij afspelen:', error);
        showStatus('Fout bij het afspelen. Zorg dat je een Spotify Premium-account hebt.', 'error');
    }
}

function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';

    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
    }
}

// PWA Install functionaliteit
function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallPrompt();
    });

    installButton.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to install prompt: ${outcome}`);
            deferredPrompt = null;
        }
        hideInstallPrompt();
    });

    dismissInstall.addEventListener('click', hideInstallPrompt);

    window.addEventListener('appinstalled', () => {
        hideInstallPrompt();
        showStatus('App succesvol geïnstalleerd!', 'success');
    });
}

function showInstallPrompt() {
    installPrompt.classList.add('show');
}

function hideInstallPrompt() {
    installPrompt.classList.remove('show');
}

// Service Worker registratie
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
