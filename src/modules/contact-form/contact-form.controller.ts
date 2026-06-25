import { Response } from 'express';
import ContactForm, { CONTACT_STATUSES, ContactStatus } from '../contact-form/contact-form.model';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';

export const createContactForm = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { name, email, phone, category, message } = req.body;
  try {
    if (!name || !email) {
      res.status(400).json({ error: 'Invalid fields' }); return;
    }
    const contactForm = new ContactForm({
      name,
      email,
      phone,
      category,
      message,
      // Link the ticket to the submitter when the request is authenticated (optionalAuth).
      userId: req.user || undefined,
    });
    const data = await contactForm.save();
    if (data) {
      res.status(201).json({ message: 'Contact Form created successfully', data });
    } else {
      res.status(500).json({ error: 'Contact Form not created' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getContactFormData = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { status, category } = req.query;
    const filter: Record<string, unknown> = {};
    if (typeof status === 'string' && status) filter.status = status;
    if (typeof category === 'string' && category) filter.category = category;

    const data = await ContactForm.find(filter).sort({ createdAt: -1 }).exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Contact Data fetched' : 'Contact Data not found', data.length > 0, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const updateContactFormStatus = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: ContactStatus };

    if (!CONTACT_STATUSES.includes(status)) {
      res.status(400).json(commonResponse('Invalid status', false)); return;
    }

    const data = await ContactForm.findByIdAndUpdate(id, { status }, { new: true, runValidators: true }).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Status updated' : 'Contact Form not found', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const countContactFormData = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await ContactForm.countDocuments();
    res.status(200).json(commonResponse('Contact Data count', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};
