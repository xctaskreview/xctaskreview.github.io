import { useCallback, useEffect, useState } from 'react';
import {
  IOS_INSTALL_HINT,
  canPromptNativeInstall,
  isIosDevice,
  isStandaloneApp,
  promptNativeInstall,
  subscribeToInstallPrompt,
} from './pwaInstall';

export function usePwaInstall() {
  const [installed, setInstalled] = useState(() => isStandaloneApp());
  const [nativeInstallReady, setNativeInstallReady] = useState(canPromptNativeInstall);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (isStandaloneApp()) {
      setInstalled(true);
      return;
    }

    return subscribeToInstallPrompt(() => {
      setNativeInstallReady(true);
    });
  }, []);

  const handleInstallClick = useCallback(async () => {
    setHint(null);

    if (nativeInstallReady && canPromptNativeInstall()) {
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

    setHint('Install is not available in this browser yet. Try Chrome or Edge on desktop or Android.');
  }, [nativeInstallReady]);

  return { installed, hint, handleInstallClick };
}
