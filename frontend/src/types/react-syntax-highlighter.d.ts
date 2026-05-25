declare module "react-syntax-highlighter" {
  import type { ComponentType, ReactNode } from "react";

  export const Prism: ComponentType<{
    children?: ReactNode;
    customStyle?: Record<string, string | number>;
    language?: string;
    style?: Record<string, unknown>;
  }>;
}

declare module "react-syntax-highlighter/dist/esm/styles/prism" {
  export const oneLight: Record<string, unknown>;
}
