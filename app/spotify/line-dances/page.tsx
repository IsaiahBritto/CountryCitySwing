import LineDancesPageClient from "./LineDancesPageClient";

export const metadata = {
  title: "Line Dance Associations | Country City Swing",
  description: "Associate line dance names and levels with Spotify LD tracks",
  robots: { index: false, follow: false },
};

export default function LineDancesPage() {
  return <LineDancesPageClient />;
}
