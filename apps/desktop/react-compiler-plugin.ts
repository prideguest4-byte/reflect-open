import react from '@vitejs/plugin-react'

/**
 * `@vitejs/plugin-react` configured with the React Compiler enabled.
 *
 * The React Compiler (https://react.dev/learn/react-compiler) runs as a Babel
 * plugin and automatically memoizes components and hooks at build time, so we
 * no longer have to reach for manual `useMemo` / `useCallback` / `React.memo`.
 * It targets React 19 by default, which is the version this app ships.
 *
 * Shared between `vite.config.ts` (dev + production builds) and
 * `vitest.config.ts` so tests exercise the same compiled output the app ships.
 *
 * @returns The React Vite plugin with `babel-plugin-react-compiler` applied.
 */
export function reactWithCompiler(): ReturnType<typeof react> {
  return react({
    babel: {
      plugins: ['babel-plugin-react-compiler'],
    },
  })
}
