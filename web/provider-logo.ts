import snapshot from './provider-logos.json';
import type { Provider } from './catalog';

const logos: Record<string, { src: string; website: string }> =
  snapshot.providers;
export function providerLogoSrc(provider: Provider): string | undefined {
  const embedded = provider.logoDataUri;
  if (
    embedded &&
    embedded.length < 131072 &&
    /^data:image\/(?:png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/.test(
      embedded
    )
  )
    return embedded;
  return Object.hasOwn(logos, provider.id) ? logos[provider.id].src : undefined;
}
