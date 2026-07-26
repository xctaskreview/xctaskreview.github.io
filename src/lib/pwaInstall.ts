interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const installPromptListeners = new Set<() => void>();

function notifyInstallPromptAvailable(): void {
  installPromptListeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    notifyInstallPromptAvailable();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
  });
}

export function isStandaloneApp(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIosDevice(userAgent: string = navigator.userAgent): boolean {
  return /iphone|ipad|ipod/i.test(userAgent);
}

export function isAndroidDevice(userAgent: string = navigator.userAgent): boolean {
  return /android/i.test(userAgent);
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
    // Ignore registration failures in unsupported contexts.
  });
}

export function subscribeToInstallPrompt(onAvailable: () => void): () => void {
  installPromptListeners.add(onAvailable);
  if (deferredInstallPrompt) {
    onAvailable();
  }

  return () => {
    installPromptListeners.delete(onAvailable);
  };
}

export function canPromptNativeInstall(): boolean {
  return deferredInstallPrompt !== null;
}

export async function promptNativeInstall(): Promise<boolean> {
  if (!deferredInstallPrompt) return false;

  await deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  return choice.outcome === 'accepted';
}

export const IOS_INSTALL_HINT =
  'On iPhone or iPad: tap Share in Safari, then choose “Add to Home Screen”.';

export const ANDROID_INSTALL_HINT =
  'To install: open Chrome’s menu (⋮), then tap “Install app” or “Add to Home screen”.';

export const GENERIC_INSTALL_HINT =
  'Install is not available in this browser yet. Use Chrome or Edge on desktop or Android, or add this page to your home screen from the browser menu.';
