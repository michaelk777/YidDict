export const documentDirectory = 'file:///mock-documents/';
export const EncodingType = { UTF8: 'utf8' as const };
export const writeAsStringAsync = jest.fn().mockResolvedValue(undefined);
export const readAsStringAsync = jest.fn().mockResolvedValue('');
