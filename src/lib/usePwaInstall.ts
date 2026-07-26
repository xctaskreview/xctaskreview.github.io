import { useCallback, useEffect, useState } from 'react';
import {
  ANDROID_INSTALL_HINT,
  GENERIC_INSTALL_HINT,
  IOS_INSTALL_HINT,
  canPromptNativeInstall,
  isAndroidDevice,
  isIosDevice,
  isStandaloneApp,
  promptNativeInstall,
} from './pwaInstall';

export function usePwaInstall() {
  const [installed, setInstalled] = useState(() => isStandaloneApp());
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (isStandaloneApp()) {
      setInstalled(true);
      return;
    }

    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  const handleInstallClick = useCallback(async () => {
    setHint(null);

    if (canPromptNativeInstall()) {
      const accepted = await promptNativeInstall();
      if (accepted) {
        setInstalled(true);
      }
      return;
    }

    if (isIosDevice()) {
      setHint(IOS_INSTALL_HINT);
      return;
    }

    if (isAndroidDevice()) {
      setHint(ANDROID_INSTALL_HINT);
      return;
    }

    setHint(GENERIC_INSTALL_HINT);
  }, []);

  return { installed, hint, handleInstallClick };
}
