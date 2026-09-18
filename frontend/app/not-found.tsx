/* eslint-disable @next/next/no-html-link-for-pages -- Not-found recovery must work without client navigation. */
export default function NotFound() {
  return <main className="center-layout"><section className="focus-card"><p className="eyebrow">ClientScope · 404</p><h1>Page not found</h1><p>This address does not lead to an available page.</p><a className="primary button-link" href="/">Back to ClientScope</a><a className="secondary button-link" href="/sign-in">Sign in</a></section></main>;
}
