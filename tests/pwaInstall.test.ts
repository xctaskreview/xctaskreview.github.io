import { describe, expect, it } from 'vitest';
import { canPromptNativeInstall, isAndroidDevice, isIosDevice } from '../src/lib/pwaInstall';

describe('pwaInstall helpers', () => {
  it('detects Android user agents', () => {
    expect(isAndroidDevice('Mozilla/5.0 (Linux; Android 14; Pixel Tablet)')).toBe(true);
    expect(isAndroidDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe(false);
  });

  it('detects iOS user agents', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14; Pixel Tablet)')).toBe(false);
  });

  it('starts without a deferred install prompt', () => {
    expect(canPromptNativeInstall()).toBe(false);
  });
});
