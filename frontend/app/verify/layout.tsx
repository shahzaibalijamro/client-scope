import type { ReactNode } from "react";
import { publicMetadata } from "../public-metadata";
export const generateMetadata = () => publicMetadata("/verify");
export default function VerifyLayout({ children }: { children: ReactNode }) { return children; }
