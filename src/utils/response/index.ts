import { IApiResponse, IPaginationMeta } from '../../types';

export const commonResponse = <T = unknown>(
  message: string,
  success: boolean,
  data?: T,
  meta?: IPaginationMeta
): IApiResponse<T> => {
  const response: IApiResponse<T> = { message, success };
  if (data !== undefined) response.data = data;
  if (meta !== undefined) response.meta = meta;
  return response;
};

export const returnjson = (data: unknown): unknown => {
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return data;
  }
};
