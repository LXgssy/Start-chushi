"use client";

/* 手绘风格天气线性图标（1.5px 描边） */
import { weatherGroup, type WeatherGroup } from "@/lib/startpage/weather";

export default function WeatherGlyph({
  code,
  size = 20,
  className = "",
}: {
  code: number | null;
  size?: number;
  className?: string;
}) {
  const group: WeatherGroup = weatherGroup(code);
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  switch (group) {
    case "clear":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" />
        </svg>
      );
    case "partly":
      return (
        <svg {...common}>
          <circle cx="8.5" cy="8" r="3" />
          <path d="M8.5 2.5v1.4M3 8h1.4M4.7 4.2l1 1M15 5.5a5.5 5.5 0 0 1 .9 10.9" opacity=".0" />
          <path d="M7 19h9a3.5 3.5 0 0 0 .6-6.95A5 5 0 0 0 7.1 13 3 3 0 0 0 7 19Z" />
        </svg>
      );
    case "cloudy":
      return (
        <svg {...common}>
          <path d="M6.5 18h10a4 4 0 0 0 .8-7.92A6 6 0 0 0 5.66 11.5 3.25 3.25 0 0 0 6.5 18Z" />
          <path d="M16 4.5c1.6.4 2.9 1.6 3.5 3.2" opacity=".45" />
        </svg>
      );
    case "fog":
      return (
        <svg {...common}>
          <path d="M7 13.5h10a3.5 3.5 0 0 0 .6-6.95A5 5 0 0 0 8 8" />
          <path d="M4 16.5h16M6 20h12" opacity=".7" />
        </svg>
      );
    case "rain":
      return (
        <svg {...common}>
          <path d="M7 14.5h9.5a3.75 3.75 0 0 0 .65-7.44A5 5 0 0 0 7.3 8.05 3.25 3.25 0 0 0 7 14.5Z" />
          <path d="m9.5 17.5-.8 2.6M13 17.5l-.8 2.6M16.5 17.5l-.8 2.6" />
        </svg>
      );
    case "snow":
      return (
        <svg {...common}>
          <path d="M7 14h9.5a3.75 3.75 0 0 0 .65-7.44A5 5 0 0 0 7.3 7.55 3.25 3.25 0 0 0 7 14Z" />
          <path d="M9 18h.01M12 20h.01M15 18h.01" strokeWidth={2} />
        </svg>
      );
    case "thunder":
      return (
        <svg {...common}>
          <path d="M7 13h9.5a3.75 3.75 0 0 0 .65-7.44A5 5 0 0 0 7.3 6.55 3.25 3.25 0 0 0 7 13Z" />
          <path d="m13 14-2.2 3.6h2.8L11.4 21" />
        </svg>
      );
  }
}
