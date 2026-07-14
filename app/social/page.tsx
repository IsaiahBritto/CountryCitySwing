import SocialRequestPageClient from "./SocialRequestPageClient";

export const metadata = {
  title: "Song Requests | Country City Swing",
  description: "Request a song for tonight’s Country City Swing Social",
  robots: { index: false, follow: false },
};

export default function SocialPage() {
  return <SocialRequestPageClient />;
}
