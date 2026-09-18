import { AuthScreen } from "../client-scope-app";
import { PublicEntry } from "../public-entry";
import { publicMetadata } from "../public-metadata";
export const generateMetadata = () => publicMetadata("/sign-up");
export default function SignUpPage() { return <PublicEntry><AuthScreen mode="signup" /></PublicEntry>; }
