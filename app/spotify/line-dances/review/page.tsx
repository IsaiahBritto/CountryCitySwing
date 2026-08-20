import LineDanceReviewPageClient from "./LineDanceReviewPageClient";

export const metadata = {
  title: "Line Dance Review | Country City Swing",
  description: "Classify line dance songs with dance name and difficulty level",
  robots: { index: false, follow: false },
};

export default function LineDanceReviewPage() {
  return <LineDanceReviewPageClient />;
}
