export function measureHonorLayout(row) {
  const summary = row.querySelector('.honor-summary');
  const media = row.querySelector('.honor-icon');
  const image = media.matches('img') ? media : media.querySelector('img');
  const range = document.createRange();
  range.selectNodeContents(row.querySelector('.honor-message'));
  const icon = media.getBoundingClientRect();
  const overlapsText = [...range.getClientRects()].some(text =>
    text.width > 0 && text.height > 0 && icon.left < text.right - 1 &&
    icon.right > text.left + 1 && icon.top < text.bottom - 1 && icon.bottom > text.top + 1);
  return {
    summary: summary.textContent,
    milestone: summary.querySelector('.honor-milestone')?.textContent,
    imageLoaded: Boolean(image?.complete && image.naturalWidth && icon.width && icon.height),
    overlapsText,
  };
}
