"use client";
import { useState } from "react";
import type { PublicMedia } from "./public-media";

export function PublicImage({ media }: { media: PublicMedia }) {
  const [failed, setFailed] = useState(false);
  return <div className={`public-product-image public-product-image-${media.id}`}>
    {failed ? <div className="public-image-fallback" role="img" aria-label={media.alt}><strong>Product preview unavailable</strong><p>Explore this workflow in the shared demo.</p><a href="/sign-in?intent=demo">Explore demo</a></div> :
      /* The manifest supplies stable public assets; no private image proxy or attachment is involved. */
      // eslint-disable-next-line @next/next/no-img-element
      <img src={media.url} alt={media.alt} width={media.width} height={media.height} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
  </div>;
}
