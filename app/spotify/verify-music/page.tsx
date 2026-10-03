import VerifyMusicPageClient from "./VerifyMusicPageClient";

export const metadata = {
  title: "Verify Music | Country City Swing",
  description: "Classify Country Swing master playlist tracks",
  robots: { index: false, follow: false },
};

export default function VerifyMusicPage() {
  return <VerifyMusicPageClient />;
}
