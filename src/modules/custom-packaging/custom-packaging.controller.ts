import { Response } from 'express';
import CustomPackaging from '../custom-packaging/custom-packaging.model';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';

export const createCustomPackage = async (req: IAuthRequest, res: Response): Promise<void> => {
  const {
    // Legacy shape
    name,
    email,
    phone,
    description,
    // Storefront custom-packaging form
    company_name,
    product_category,
    moq,
    rich_text,
    contact_person_name,
    contact_person_email,
    contact_person_mobile_number,
  } = req.body;

  try {
    // Keep the four canonical fields populated no matter which payload shape
    // arrived, so historical/admin consumers that read name/email/phone/
    // description never see empty rows.
    const doc = {
      name: name || contact_person_name,
      email: email || contact_person_email,
      phone: phone || contact_person_mobile_number,
      description: description || rich_text,
      company_name,
      product_category,
      moq,
      rich_text,
      contact_person_name,
      contact_person_email,
      contact_person_mobile_number,
    };

    if (!doc.name || !doc.email || !doc.phone || !doc.description) {
      res.status(400).json(commonResponse('Invalid fields', false)); return;
    }

    const customPackage = new CustomPackaging(doc);
    const data = await customPackage.save();
    res.status(data ? 201 : 400).json(commonResponse(data ? 'Custom packaging created successfully' : 'Custom packaging not created', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getCustomPackageData = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await CustomPackaging.find().sort({ createdAt: -1 }).exec();
    // Always 200 with the (possibly empty) array: the admin tab renders an
    // empty state instead of hanging on "Loading data..." when there are no
    // submissions yet.
    res.status(200).json(commonResponse(data.length > 0 ? 'Custom Form Data fetched' : 'No custom packaging enquiries found', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const countCustomPackages = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await CustomPackaging.countDocuments();
    res.status(200).json(commonResponse('Custom Form Data count', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};
