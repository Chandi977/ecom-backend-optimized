import { Response } from 'express';
import AppVersion from '../app-version/app-version.model';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';

export const getAppVersion = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AppVersion.findOne().sort({ createdAt: -1 }).exec();
    if (!data) {
      res.status(404).json(commonResponse('No version config found', false)); return;
    }
    res.status(200).json(commonResponse('App version fetched successfully', true, {
      platform: data.platform,
      version: data.version,
      forceUpdate: data.forceUpdate,
      updateMessage: data.updateMessage,
    }));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const createAppVersion = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { platform, version, forceUpdate, updateMessage } = req.body;
    if (!platform || !version) {
      res.status(400).json(commonResponse('platform and version are required', false)); return;
    }
    const appVersion = new AppVersion({ platform, version, forceUpdate, updateMessage });
    const data = await appVersion.save();
    res.status(201).json(commonResponse('App version created successfully', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const updateAppVersion = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { platform, version, forceUpdate, updateMessage } = req.body;
    if (!platform && !version && forceUpdate === undefined && updateMessage === undefined) {
      res.status(400).json(commonResponse('At least one field to update is required', false)); return;
    }
    const update: Record<string, unknown> = {};
    if (platform !== undefined) update.platform = platform;
    if (version !== undefined) update.version = version;
    if (forceUpdate !== undefined) update.forceUpdate = forceUpdate;
    if (updateMessage !== undefined) update.updateMessage = updateMessage;

    const data = await AppVersion.findByIdAndUpdate(id, update, { new: true, runValidators: true }).exec();
    if (!data) {
      res.status(404).json(commonResponse('Version config not found', false)); return;
    }
    res.status(200).json(commonResponse('App version updated successfully', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getAllAppVersions = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AppVersion.find().sort({ createdAt: -1 }).exec();
    res.status(200).json(commonResponse('App versions fetched successfully', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const deleteAppVersion = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const target = await AppVersion.findById(id).exec();
    if (!target) {
      res.status(404).json(commonResponse('Version config not found', false)); return;
    }
    await AppVersion.deleteOne({ _id: id }).exec();
    res.status(200).json(commonResponse('App version deleted successfully', true));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};
