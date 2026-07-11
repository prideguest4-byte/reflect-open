/**
 * The App Review demo key. App Store reviewers have no BYOK key, so this
 * sentinel (shared with Apple in the App Review notes; not a secret) makes
 * transcription produce a canned local transcript instead of calling any
 * provider. Only `memoNoteBody` in `actions/audio-memo` consults it: capture
 * and note plumbing run exactly as in production, and the network is never
 * touched.
 */
export const APP_REVIEW_STUB_KEY = 'sk-demo-app-review'

export function stubTranscriptBody(): string {
  return (
    "This is a demo transcription produced by Reflect's App Review demo key. " +
    'No audio left the device and no AI provider was called.\n\n' +
    `Demo transcript generated at ${new Date().toLocaleString()}.`
  )
}
