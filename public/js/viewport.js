// The height the app should be, which on iOS no CSS unit reports correctly.
//
// In an installed app with a translucent status bar the web view is the whole
// screen while only the part below the status bar is visible: 812 against 762 on
// a 375x812 phone. 100% says 812. 100dvh says 812. env(safe-area-inset-top) says
// 0, because the viewport meta does not ask to cover the safe area. So the app
// stood 50px taller than its own window, which put the bottom of every list out
// of reach and let the header be dragged up by that much.
//
// window.innerHeight is right in every case measured, so it is measured.

export function trackViewportHeight() {
  const apply = () => {
    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
  }

  apply()
  // Not visualViewport.height: that one shrinks for the keyboard, and this is the
  // height of the app rather than of the space left over above a keyboard.
  for (const event of ['resize', 'orientationchange', 'pageshow']) {
    window.addEventListener(event, apply, { passive: true })
  }
  // Rotating reports the old size for a frame or two on iOS.
  window.addEventListener('orientationchange', () => setTimeout(apply, 300), { passive: true })
}
