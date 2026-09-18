import { AuthScreen } from "../client-scope-app";
import { PublicEntry } from "../public-entry";
import { publicMetadata } from "../public-metadata";
import { hasDemoIntent } from "../public-routes";
export const generateMetadata = () => publicMetadata("/sign-in");
export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { intent } = await searchParams;
  const search = new URLSearchParams();
  for (const value of Array.isArray(intent) ? intent : intent === undefined ? [] : [intent]) search.append("intent", value);
  return <PublicEntry><AuthScreen demoIntent={hasDemoIntent(search)} /></PublicEntry>;
}
