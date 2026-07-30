import React, { useEffect, useRef, useState } from 'react';
import { Text, TextStyle } from 'react-native';

/**
 * Animated number: counts rapidly from zero and settles on the final
 * value. Numbers ease out so the last digits land gently.
 */
export function CountUp({
  value,
  format,
  duration = 900,
  style,
}: {
  value: number;
  format: (v: number) => string;
  duration?: number;
  style?: TextStyle | TextStyle[];
}) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | null>(null);
  const startedFor = useRef<number | null>(null);

  useEffect(() => {
    if (startedFor.current === value) return;
    startedFor.current = value;
    const t0 = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  return <Text style={style}>{format(display)}</Text>;
}
