import { lazy } from 'react'
// Explicit development-only entry: fixtures never replace the public API catalog.
const preview = import.meta.env.DEV && new URLSearchParams(location.search).has('artistProfilePreview')
const RootApp = lazy(() => preview ? import('./ArtistProfilePilot.tsx') : import('./App.tsx'))
export default RootApp
