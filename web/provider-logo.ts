import snapshot from './provider-logos.json';
import type { Provider } from './catalog';

const logos: Record<string, { src: string; website: string }> =
  snapshot.providers;
export function providerLogoSrc(provider: Provider): string | undefined {
  const embedded = provider.logoDataUri;
  if (
    embedded &&
    embedded.length < 131072 &&
    /^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(
      embedded
    )
  )
    return embedded;
  return Object.hasOwn(logos, provider.id) ? logos[provider.id].src : undefined;
}

export function providerMark(provider: Provider): HTMLElement {
  const mark = document.createElement('span');
  mark.className = 'provider-mark';
  mark.setAttribute('aria-hidden', 'true');
  const initials = document.createElement('span');
  initials.className = 'provider-initials';
  initials.textContent = provider.name.slice(0, 2).toUpperCase();
  mark.append(initials);
  const src = providerLogoSrc(provider);
  if (!src) return mark;
  const image = document.createElement('img');
  image.className = 'provider-logo';
  image.alt = '';
  image.width = image.height = 24;
  image.loading = 'lazy';
  image.decoding = 'async';
  const loaded = () => {
    if (image.naturalWidth > 0) mark.dataset.loaded = 'true';
  };
  image.addEventListener('load', loaded);
  image.addEventListener('error', () => {
    delete mark.dataset.loaded;
    image.remove();
  });
  image.src = src;
  mark.append(image);
  if (image.complete) loaded();
  return mark;
}
