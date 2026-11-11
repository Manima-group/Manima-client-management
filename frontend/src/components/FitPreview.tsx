import { ReactNode, useLayoutEffect, useRef, useState } from "react";

/** Scales an 816px-wide document down to fit its column, like a page preview. */
export default function FitPreview({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>();

  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const s = Math.min(1, outer.current.clientWidth / 816);
      setScale(s);
      setHeight(inner.current.offsetHeight * s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} style={{ width: "100%", height, overflow: "hidden" }}>
      <div ref={inner} style={{ width: 816, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}
