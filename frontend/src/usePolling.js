import { useEffect, useRef } from 'react';
export function usePolling(fn, ms) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    saved.current();
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms, fn]);
}
