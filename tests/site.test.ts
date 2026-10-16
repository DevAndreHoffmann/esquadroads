import { describe, expect, it } from 'vitest';
import { safePixelId, safeWhatsappUrl } from '../src/lib/site';

describe('PUBLIC_WHATSAPP_URL', () => {
  it.each([
    ['https://wa.me/5541999998888', 'https://wa.me/5541999998888'],
    ['https://wa.me/5541999998888?text=Ol%C3%A1', 'https://wa.me/5541999998888?text=Ol%C3%A1'],
    ['https://wa.me/message/ABC123XYZ', 'https://wa.me/message/ABC123XYZ'],
    ['https://api.whatsapp.com/send?phone=5541999998888', 'https://api.whatsapp.com/send?phone=5541999998888'],
  ])('aceita link oficial %s', (input, expected) => {
    expect(safeWhatsappUrl(input)).toBe(expected);
  });

  it.each([undefined, '', '   ', 'wa.me/5541999998888', 'http://wa.me/5541999998888', 'https://wa.me/', 'https://evil.com/wa.me', 'javascript:alert(1)'])(
    'não gera link inválido para %s',
    (input) => {
      expect(safeWhatsappUrl(input)).toBeNull();
    },
  );
});

describe('PUBLIC_META_PIXEL_ID', () => {
  it('aceita somente IDs numéricos', () => {
    expect(safePixelId('123456789012345')).toBe('123456789012345');
    expect(safePixelId(' 123456789012345 ')).toBe('123456789012345');
    expect(safePixelId(undefined)).toBeNull();
    expect(safePixelId('')).toBeNull();
    expect(safePixelId("123'); alert(1);//")).toBeNull();
  });
});
