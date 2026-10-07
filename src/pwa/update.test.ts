import { describe, expect, it, vi } from 'vitest';
const apply = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('virtual:pwa-register', () => ({ registerSW: () => apply }));
vi.stubGlobal('__APP_VERSION__', 'test');
vi.stubGlobal('__BUILD_TIME__', '2026-10-07');
vi.stubGlobal('document', { addEventListener: () => {} });
import { installUpdate, startUpdates } from './update';

describe('updates', () => {
  it('blocks manual updates during recording or processing', () => {
    vi.useFakeTimers();
    let idle = false;
    startUpdates({ isIdle: () => idle });
    installUpdate();
    expect(apply).not.toHaveBeenCalled();
    idle = true;
    installUpdate();
    expect(apply).toHaveBeenCalledTimes(1);
    vi.clearAllTimers();
    vi.useRealTimers();
  });
});
