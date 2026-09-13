export const MAX_LOGO_LENGTH = 48_000;
/** Only small embedded PNGs; never remote URLs, SVG or executable document types. */
export function validClientLogo(value: unknown): value is string | null {
  return value === null || typeof value === 'string' && value.length <= MAX_LOGO_LENGTH && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value);
}
