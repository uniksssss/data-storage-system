import {
  logBadgeCss,
  logCardCss,
  logEmptyCss,
  logMsCss,
  logRowCss,
  logScrollCss,
  logTimeCss,
  logTitleCss,
  logUrlCss,
} from '../benchmark.style';
import type { LogEntry } from '../benchmark.types';

type RequestLogProps = {
  log: LogEntry[];
};

export function RequestLog({ log }: RequestLogProps) {
  return (
    <div css={logCardCss}>
      <p css={logTitleCss}>Лог запросов</p>
      <div css={logScrollCss}>
        {log.length === 0 ? (
          <p css={logEmptyCss}>Запусти бенчмарк чтобы увидеть лог</p>
        ) : (
          log.map((entry) => (
            <div key={entry.id} css={logRowCss}>
              <span css={logTimeCss}>{entry.time}</span>
              <span css={logBadgeCss(entry.type)}>{entry.type}</span>
              <span css={logMsCss}>{entry.ms.toFixed(1)} мс</span>
              <span css={logUrlCss}>{entry.url}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
