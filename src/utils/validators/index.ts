export const validateSignup = (body: Record<string, unknown>): boolean => {
  return !!(body.first_name && body.email_address && body.password);
};

export const validateSignin = (body: Record<string, unknown>): boolean => {
  return !!(body.email_address && body.password);
};

export const validateEmail = (email: string): boolean => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validateProduct = (body: Record<string, unknown>): boolean => {
  return !!(body.name && body.category);
};

export const validateCategory = (body: Record<string, unknown>): boolean => {
  return !!body.name;
};

export const sanitizeString = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};
