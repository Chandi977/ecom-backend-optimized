import { IOverviewField } from '../types';

export const sanitizeOverviewFields = (
  fields: unknown,
  options?: { includeValue?: boolean }
): IOverviewField[] => {
  if (!Array.isArray(fields)) return [];

  return fields
    .filter((field): field is Record<string, unknown> =>
      field !== null && typeof field === 'object' && typeof (field as Record<string, unknown>).label === 'string'
    )
    .map((field) => ({
      label: String(field.label).trim(),
      ...(options?.includeValue && field.value !== undefined
        ? { value: String(field.value).trim() }
        : {}),
      ...(field.key !== undefined && field.key !== null
        ? { key: String(field.key).trim() }
        : {}),
      // Default to visible so rows without an explicit flag stay shown.
      visible: field.visible === undefined ? true : Boolean(field.visible),
    }))
    .filter((field) => field.label.length > 0);
};
