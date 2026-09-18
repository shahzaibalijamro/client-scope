import { AuthScreen } from "../client-scope-app";
import { PublicEntry } from "../public-entry";
import { publicMetadata } from "../public-metadata";
export const generateMetadata = () => publicMetadata("/forgot-password");
export default function ForgotPasswordPage() { return <PublicEntry><AuthScreen mode="forgot" /></PublicEntry>; }
