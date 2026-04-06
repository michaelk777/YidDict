import { detectInputScript } from '../utils/inputDetector';

describe('detectInputScript', () => {
  describe('Hebrew detection', () => {
    it('detects basic Hebrew letters', () => {
      expect(detectInputScript('שיין')).toBe('hebrew');
    });

    it('detects Hebrew with nekudes', () => {
      expect(detectInputScript('שֵׁין')).toBe('hebrew');
    });

    it('detects Hebrew presentation forms (U+FB range)', () => {
      // U+FB2A = SHIN WITH SHIN DOT
      expect(detectInputScript('\uFB2A\u05DC\u05D5\u05DD')).toBe('hebrew');
    });

    it('detects a Hebrew word mixed with spaces', () => {
      expect(detectInputScript('  שיין  ')).toBe('hebrew');
    });

    it('detects Hebrew even when mixed with Latin characters', () => {
      expect(detectInputScript('sheyn שיין')).toBe('hebrew');
    });
  });

  describe('Latin detection', () => {
    it('classifies plain Latin input as latin', () => {
      expect(detectInputScript('sheyn')).toBe('latin');
    });

    it('classifies English words as latin', () => {
      expect(detectInputScript('beautiful')).toBe('latin');
    });

    it('classifies YIVO-style input as latin', () => {
      expect(detectInputScript('tshulent')).toBe('latin');
    });

    it('classifies mixed YIVO/English query as latin', () => {
      expect(detectInputScript('ikh bin a mentsh')).toBe('latin');
    });

    it('classifies empty string as latin', () => {
      expect(detectInputScript('')).toBe('latin');
    });

    it('classifies whitespace-only string as latin', () => {
      expect(detectInputScript('   ')).toBe('latin');
    });
  });
});
