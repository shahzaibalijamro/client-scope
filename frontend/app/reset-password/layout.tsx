import type { ReactNode } from "react";
import { publicMetadata } from "../public-metadata";
export const generateMetadata = () => publicMetadata("/reset-password");
export default function ResetLayout({ children }: { children: ReactNode }) { return children; }
