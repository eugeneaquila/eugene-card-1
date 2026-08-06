export function Table(rows=[]) {
  return rows.map(row => `<tr>${row}</tr>`).join('');
}
