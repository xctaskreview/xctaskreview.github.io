import { describe, expect, it } from 'vitest';
import {
  canPromptNativeInstall,
  isAndroidDevice,
  isIosDevice,
  shouldOfferAndroidInstallHint,
} from '../src/lib/pwaInstall';

describe('pwaInstall helpers', () => {
  it('detects Android user agents', () => {
    expect(isAndroidDevice('Mozilla/5.0 (Linux; Android 14; Pixel Tablet)')).toBe(true);
    expect(isAndroidDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe(false);
  });

  it('detects Android from Client Hints platform when UA is desktop', () => {
    expect(
      isAndroidDevice(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Android',
      ),
    ).toBe(true);
  });

  it('detects iOS user agents', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14; Pixel Tablet)')).toBe(false);
  });

  it('offers Android install hint for desktop-site Chrome on touch tablets', () => {
    expect(
      shouldOfferAndroidInstallHint({
        userAgent:
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it('does not offer Android install hint for desktop Chrome without touch', () => {
    expect(
      shouldOfferAndroidInstallHint({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });

  it('starts without a deferred install prompt', () => {
    expect(canPromptNativeInstall()).toBe(false);
  });
});
