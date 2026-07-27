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

export function isAndroidDevice(
  userAgent: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  platform?: string,
): boolean {
  if (/android/i.test(userAgent)) return true;
  if (platform === 'Android') return true;
  if (typeof navigator !== 'undefined') {
    const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
    if (uaData?.platform === 'Android') return true;
  }
  return false;
}

/** Chrome “Desktop site” on Android tablets drops “Android” from the UA string. */
export function shouldOfferAndroidInstallHint(options: {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
} = {}): boolean {
  const userAgent = options.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const maxTouchPoints =
    options.maxTouchPoints ?? (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0);

  if (isAndroidDevice(userAgent, options.platform)) return true;
  if (isIosDevice(userAgent)) return false;
  if (maxTouchPoints <= 0) return false;
  return /Chrome\//.test(userAgent) && !/Edg\//.test(userAgent);
}

export async function probeAndroidInstallHint(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent;
  const maxTouchPoints = navigator.maxTouchPoints;

  if (shouldOfferAndroidInstallHint({ userAgent, maxTouchPoints })) {
    return true;
  }

  const uaData = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
  if (!uaData?.getHighEntropyValues) return false;

  try {
    const values = await uaData.getHighEntropyValues(['platform']);
    return shouldOfferAndroidInstallHint({
      userAgent,
      platform: values.platform,
      maxTouchPoints,
    });
  } catch {
    return false;
  }
}

interface UserAgentData {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ platform?: string }>;
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  const base = import.meta.env.BASE_URL;
  const swUrl = `${base}sw.js`.replace(/\/{2,}/g, '/');
  const scope = base.endsWith('/') ? base : `${base}/`;

  void navigator.serviceWorker.register(swUrl, { scope }).catch(() => {
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
  'To install: open Chrome’s menu (⋮), then tap “Install app” or “Add to Home screen”. If those options are missing, turn off “Desktop site” in the menu and try again.';

export const GENERIC_INSTALL_HINT =
  'Install is not available in this browser yet. Use Chrome or Edge on desktop or Android, or add this page to your home screen from the browser menu.';
