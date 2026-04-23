interface LpTickBarProps {
  count: number;
  highlightEvery?: number;
  height?: number;
  className?: string;
}

export default function LpTickBar({
  count,
  highlightEvery = 5,
  height = 12,
  className,
}: LpTickBarProps) {
  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "flex-end", gap: 3, height }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            width: 1,
            height: i % highlightEvery === 0 ? "100%" : "45%",
            background: i % highlightEvery === 0 ? "#1f5aa8" : "rgba(10,26,54,0.35)",
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  );
}
