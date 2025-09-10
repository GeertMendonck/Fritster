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
    const data = result.data;
    console.log('Gescande data:', data);

    if (isSpotify(data)) {
        stopScanner();
        openSpotify(data);
    } else {
        showStatus('Dit is geen Spotify-code', 'error');
    }
}

function isSpotify(data) {
    // Controleert of de data een Spotify URL of URI is.
    // De 'includes' check is hier veiliger dan een 'startsWith' omdat sommige QR codes
    // omleidingen van Google gebruiken die de URL aanpassen.
    return data.includes('spotify.com/track/') || data.includes('spotify:track:');
}

function openSpotify(data) {
    if (!data) {
        showStatus('Geen track URL beschikbaar', 'error');
        return;
    }

    // De juiste deep link is de data zelf, mocht het een URI zijn.
    // Anders converteer je de URL naar een URI.
    let finalUri = data;
    if (data.includes('spotify.com/track/')) {
        const trackId = data.match(/track\/([a-zA-Z0-9]+)/);
        if (trackId && trackId[1]) {
            finalUri = `spotify:track:${trackId[1]}`;
        }
    }

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = finalUri;
    document.body.appendChild(iframe);

    // Val terug op de webversie na een korte vertraging
    setTimeout(() => {
        // Zorgt ervoor dat de gebruiker wordt doorgestuurd naar de webversie als de app niet opent.
        if (data.startsWith('http')) {
            window.open(data, '_blank');
        }
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
