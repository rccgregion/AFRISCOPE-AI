/** Split PostgreSQL migration statements without splitting semicolons in strings or dollar quotes. */
export function statements(sql: string): string[] {
  const result: string[] = [];
  let start = 0,
    quote = '',
    dollar = '',
    lineComment = false,
    blockComment = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i],
      next = sql[i + 1];
    if (lineComment) {
      if (c === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (c === '*' && next === '/') {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        i += dollar.length - 1;
        dollar = '';
      }
      continue;
    }
    if (quote) {
      if (c === quote) {
        if (sql[i + 1] === quote) i++;
        else quote = '';
      }
      continue;
    }
    if (c === '-' && next === '-') {
      lineComment = true;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      blockComment = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (c === '$') {
      const match = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/);
      if (match) {
        dollar = match[0];
        i += dollar.length - 1;
        continue;
      }
    }
    if (c === ';') {
      const s = sql.slice(start, i).trim();
      if (s) result.push(s);
      start = i + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) result.push(tail);
  return result;
}
