let qrScanner = null;
let deferredPrompt = null;

// DOM Elements
const video = document.getElementById('video');
const scanButton = document.getElementById('scanButton');
const status = document.getElementById('status');
const installPrompt = document.getElementById('installPrompt');
const installButton = document.getElementById('installButton');
const dismissInstall = document.getElementById('dismissInstall');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupInstallPrompt();
});

function initializeApp() {
    scanButton.addEventListener('click', toggleScanner);
}

async function toggleScanner() {
    if (qrScanner) {
        stopScanner();
    } else {
        await startScanner();
    }
}

async function startScanner() {
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
    const url = result.data;
    console.log('Gescande URL:', url); // Belangrijk voor debugging

    if (isSpotifyUrl(url)) {
        stopScanner();
        openSpotify(url);
    } else {
        showStatus('Dit is geen Spotify QR-code', 'error');
    }
}

function isSpotifyUrl(url) {
    // Verbeterde check: controleert op de verkorte Google-link en de standaard Spotify-URI.
    // Let op: 'googleusercontent.com' is een Google-domein, dus de check is flexibeler.
    const isGoogleSpotifyLink = url.includes('googleusercontent.com') && url.includes('spotify.com');
    const isSpotifyUri = url.startsWith('spotify:track:');
    
    return isGoogleSpotifyLink || isSpotifyUri;
}

function openSpotify(trackUrl) {
    if (!trackUrl) {
        showStatus('Geen track URL beschikbaar', 'error');
        return;
    }
    
    // Converteer de Google-link naar een Spotify deep link
    let finalUrl = trackUrl;
    if (trackUrl.includes('googleusercontent.com')) {
        finalUrl = trackUrl.replace('http://googleusercontent.com/spotify.com/', 'spotify://');
    }

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = finalUrl;
    document.body.appendChild(iframe);

    // Val terug op de webversie na een korte vertraging, mocht de app niet openen
    setTimeout(() => {
        window.open(trackUrl, '_blank');
        document.body.removeChild(iframe);
    }, 2000);

    showStatus('Track wordt geopend in Spotify...', 'success');
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

// PWA Install functionality
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

// Service Worker registration
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
