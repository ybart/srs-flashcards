// The height the app should be, which on iOS no CSS unit reports correctly.
//
// In an installed app with a translucent status bar the web view is the whole
// screen while only the part below the status bar is visible: 812 against 762 on
// a 375x812 phone. 100% says 812. 100dvh says 812. env(safe-area-inset-top) says
// 0, because the viewport meta does not ask to cover the safe area. So the app
// stood 50px taller than its own window, which put the bottom of every list out
// of reach and let the header be dragged up by that much.
//
// The layout viewport is what to fill: documentElement.clientHeight. Sizing to
// innerHeight was measurably wrong — the app then filled 762px of an 812px window
// and iOS panned the difference, which read as a header that could be dragged.

export function trackViewportHeight() {
  const apply = () => {
    // documentElement.clientHeight is the *layout* viewport — the box the document
    // has to fill for there to be nothing to pan. innerHeight is the visual one,
    // and in a standalone web app the two differ by the status bar: filling 762 of
    // an 812 window left 50px for iOS to drag the whole app across.
    const height = document.documentElement.clientHeight || window.innerHeight

    document.documentElement.style.setProperty('--app-height', `${height}px`)
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
