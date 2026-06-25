const MOJIBAKE_PATTERNS: Array<[RegExp, string]> = [
  [/Ã©/g, 'é'],
  [/Ã¨/g, 'è'],
  [/Ãª/g, 'ê'],
  [/Ã«/g, 'ë'],
  [/Ã /g, 'à'],
  [/Ã¢/g, 'â'],
  [/Ã¤/g, 'ä'],
  [/Ã´/g, 'ô'],
  [/Ã¶/g, 'ö'],
  [/Ã¹/g, 'ù'],
  [/Ã»/g, 'û'],
  [/Ã¼/g, 'ü'],
  [/Ã§/g, 'ç'],
  [/Ã®/g, 'î'],
  [/Ã¯/g, 'ï'],
  [/Å"/g, 'œ'],
  [/Â/g, ''],
];

export const normalizeMojibake = (text: string): string => {
  let result = text;
  for (const [pattern, replacement] of MOJIBAKE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
};

export const normalizeMojibakeInObject = <T>(obj: T): T => {
  if (typeof obj === 'string') {
    return normalizeMojibake(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeMojibakeInObject(item)) as unknown as T;
  }

  if (obj !== null && typeof obj === 'object') {
    const prototype = Object.getPrototypeOf(obj);
    if (prototype && prototype !== Object.prototype) {
      return obj;
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = normalizeMojibakeInObject(value);
    }
    return result as T;
  }

  return obj;
};
