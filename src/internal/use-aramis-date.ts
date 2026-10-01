import { useEffect, useState } from 'react';
import { aramisDate, millisecondsUntilAramisDayChange } from '../domain/work-lists';

/** Keep an open workspace current across midnight and suspended/background tabs. */
export function useAramisDate(): string {
  const [today, setToday] = useState(() => aramisDate());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      clearTimeout(timer);
      const now = new Date();
      setToday(aramisDate(now));
      timer = setTimeout(refresh, millisecondsUntilAramisDayChange(now) + 25);
    }
    function visible() { if (document.visibilityState === 'visible') refresh(); }
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  return today;
}
