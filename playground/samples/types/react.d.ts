// Just enough of React's types for the TypeScript samples to type-check.
declare module "react" {
  export function useState<S>(initial: S): [S, (value: S) => void];
  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
}

declare module "react/jsx-runtime" {
  export namespace JSX {
    interface Element {}
    interface IntrinsicElements {
      [name: string]: any;
    }
  }
  export function jsx(type: unknown, props: unknown): JSX.Element;
  export function jsxs(type: unknown, props: unknown): JSX.Element;
}
