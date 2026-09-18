"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Error recovery must work without client navigation. */
export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="center-layout"><section className="focus-card"><p className="eyebrow">ClientScope</p><h1>This page is unavailable</h1><p role="alert">We couldn’t open this page. Try again or return to the homepage.</p><button className="primary" onClick={reset}>Try again</button><a className="secondary button-link" href="/">Back to ClientScope</a><a href="/sign-in">Sign in</a></section></main>;
}
