import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  "aria-hidden": true,
  focusable: false,
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function CloseIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m4 4 8 8M12 4l-8 8" /></svg>;
}

export function BackIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m9.5 3-5 5 5 5" /><path d="M5 8h7" /></svg>;
}

export function PlusIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="M8 3v10M3 8h10" /></svg>;
}

export function ClearIcon(props: IconProps) {
  return <svg {...base} {...props}><circle cx="8" cy="8" r="5" /><path d="m6.2 6.2 3.6 3.6m0-3.6-3.6 3.6" /></svg>;
}

export function CheckIcon(props: IconProps) {
  return <svg {...base} {...props}><path d="m3.5 8 3 3 6-6" /></svg>;
}
