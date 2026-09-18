import type { Metadata } from "next";
import { validatePublicOrigin } from "./public-origin";

const routeCopy = {
  "/": ["ClientScope — Clear work. Clear decisions.", "Keep client scope, changes, delivery reviews, and explicit approvals in one shared record. Built for freelancers and small service teams."],
  "/sign-in": ["Sign in — ClientScope", "Sign in to your ClientScope account or explore the shared demo."],
  "/sign-up": ["Create an account — ClientScope", "Create and verify your ClientScope account."],
  "/forgot-password": ["Account recovery — ClientScope", "Request a link to reset your ClientScope password."],
  "/verify": ["Verify your email — ClientScope", "Confirm your ClientScope email address."],
  "/reset-password": ["Reset your password — ClientScope", "Choose a new password for your ClientScope account."],
} as const;

export function publicMetadata(path: keyof typeof routeCopy, origin = validatePublicOrigin(process.env.FRONTEND_ORIGIN, process.env.NODE_ENV, process.env.PUBLIC_ORIGIN_MODE === "local" || !process.env.VERCEL)): Metadata {
  const [title, description] = routeCopy[path];
  const url = `${origin}${path}`;
  return {
    metadataBase: new URL(origin), title, description,
    alternates: { canonical: url },
    robots: { index: path === "/", follow: path === "/" },
    referrer: "no-referrer",
    openGraph: { type: "website", siteName: "ClientScope", title, description, url,
      images: [{ url: `${origin}/social-card`, width: 1200, height: 630, alt: "ClientScope — Clear work. Clear decisions. Scope, review, approval, and history." }] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/social-card`] },
    icons: { icon: "/icon.svg" },
  };
}
