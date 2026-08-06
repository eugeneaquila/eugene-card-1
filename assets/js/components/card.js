export function Card(data={}) {
  return `<article class="ec-card">${data.name || ''}</article>`;
}
