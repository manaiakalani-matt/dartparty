import { describe, expect, it, vi } from "vitest";
import { installLegacyViewport } from "./legacyViewport";

function fakeBrowser(supportsDynamicHeight: boolean) {
  return {
    CSS: { supports: vi.fn(() => supportsDynamicHeight) },
    innerHeight: 944,
    document: { documentElement: { style: { setProperty: vi.fn() } } },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

describe("legacy Safari viewport", () => {
  it("leaves browsers with dynamic viewport support untouched", () => {
    const browser = fakeBrowser(true);
    installLegacyViewport(browser as unknown as Window & typeof globalThis)();
    expect(browser.CSS.supports).toHaveBeenCalledWith("height", "100dvh");
    expect(browser.document.documentElement.style.setProperty).not.toHaveBeenCalled();
    expect(browser.addEventListener).not.toHaveBeenCalled();
  });

  it("uses the visible height and updates when rotation or browser chrome resizes it", () => {
    const browser = fakeBrowser(false);
    const cleanup = installLegacyViewport(browser as unknown as Window & typeof globalThis);
    const resize = browser.addEventListener.mock.calls[0][1] as () => void;
    expect(browser.document.documentElement.style.setProperty).toHaveBeenLastCalledWith("--legacy-viewport-height", "944px");
    browser.innerHeight = 650;
    resize();
    expect(browser.document.documentElement.style.setProperty).toHaveBeenLastCalledWith("--legacy-viewport-height", "650px");
    cleanup();
    expect(browser.removeEventListener).toHaveBeenCalledWith("resize", resize);
  });
});
