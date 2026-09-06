import Svg, { Circle, Path } from "react-native-svg";

interface IconProps {
  size?: number;
  color: string;
}

export function RecenterIcon({ size = 20, color }: IconProps) {
  const arrow = "M 12 2.5 L 12 9 M 9.1 6.3 L 12 9.2 L 14.9 6.3";
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {[0, 90, 180, 270].map((deg) => (
        <Path
          key={deg}
          d={arrow}
          transform={`rotate(${deg} 12 12)`}
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
      <Circle cx={12} cy={12} r={1.4} fill={color} />
    </Svg>
  );
}

export function StarBadge({ size = 40, color }: IconProps) {
  const outer = 11.5;
  const inner = 5.4;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (-90 + 8 + i * 36) * (Math.PI / 180);
    pts.push(`${12 + r * Math.cos(a)},${12 + r * Math.sin(a)}`);
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={`M ${pts.join(" L ")} Z`} fill={color} />
    </Svg>
  );
}

export function PauseIcon({ size = 20, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M 9.5 6 L 9.5 18 M 14.5 6 L 14.5 18"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ResumeIcon({ size = 16, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M 8 5 L 19 12 L 8 19 Z" fill={color} />
    </Svg>
  );
}