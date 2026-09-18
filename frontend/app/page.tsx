import { PublicHome } from "./public-home";
import { PublicEntry } from "./public-entry";
import { publicMetadata } from "./public-metadata";

export const generateMetadata = () => publicMetadata("/");

export default function Home() {
  return <PublicEntry homepage><PublicHome /></PublicEntry>;
}
