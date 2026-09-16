import CcsHeading from "./CcsHeading";

type Props = {
  title: string;
  subtitle?: string;
  titleVariant?: "default" | "display" | "goldWave";
  level?: 1 | 2;
};

export default function CcsPageHeader({
  title,
  subtitle,
  titleVariant = "goldWave",
  level = 1,
}: Props) {
  return (
    <header className="text-center mb-8">
      <CcsHeading level={level} variant={titleVariant} className="mb-4">
        {title}
      </CcsHeading>
      {subtitle && <p className="ccs-body text-gray-300 max-w-2xl mx-auto">{subtitle}</p>}
      <div className="mt-6 flex justify-center">
        <div className="w-full max-w-md ccs-divider-gold" />
      </div>
    </header>
  );
}
