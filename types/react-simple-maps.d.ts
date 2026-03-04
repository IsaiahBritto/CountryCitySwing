declare module "react-simple-maps" {
  import type { ComponentType } from "react";

  export const ComposableMap: ComponentType<{
    projection?: string;
    projectionConfig?: { scale?: number };
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }>;

  export const ZoomableGroup: ComponentType<{
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    children?: React.ReactNode;
  }>;

  export const Geographies: ComponentType<{
    geography: string | object;
    children: (props: { geographies: Array<{ rsmKey: string; id?: number; properties?: { name?: string } }> }) => React.ReactNode;
  }>;

  export const Geography: ComponentType<{
    geography: unknown;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: Record<string, React.CSSProperties>;
    onClick?: () => void;
  }>;

  export const Marker: ComponentType<{
    coordinates: [number, number];
    children?: React.ReactNode;
  }>;
}
