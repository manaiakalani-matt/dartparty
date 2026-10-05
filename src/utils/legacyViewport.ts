/** Old Safari's 100vh includes space behind the browser toolbar. */
export function installLegacyViewport(browser: Window & typeof globalThis = window): () => void {
  if (browser.CSS && browser.CSS.supports("height", "100dvh")) return () => undefined;

  const updateHeight = () => {
    browser.document.documentElement.style.setProperty("--legacy-viewport-height", `${browser.innerHeight}px`);
  };
  updateHeight();
  browser.addEventListener("resize", updateHeight);
  return () => browser.removeEventListener("resize", updateHeight);
}
