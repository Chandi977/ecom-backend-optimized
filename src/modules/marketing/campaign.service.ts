import mongoose from 'mongoose';
import { EmailCampaign } from '../../models';
import { logger } from '../../utils/logger';

/**
 * Atomically fold one chunk's send result into the campaign totals. When the
 * combined sent + failed count reaches the recipient count the campaign is
 * finalised ('sent', or 'failed' if every recipient bounced). Called from the
 * email worker as each promotional-email chunk completes.
 */
export const recordCampaignProgress = async (
  campaignId: string,
  ok: number,
  failed: number,
): Promise<void> => {
  if (!mongoose.isValidObjectId(campaignId)) return;
  try {
    const doc = await EmailCampaign.findByIdAndUpdate(
      campaignId,
      { $inc: { sentCount: ok, failedCount: failed } },
      { new: true },
    ).exec();
    if (!doc) return;
    if (doc.status !== 'sent' && doc.sentCount + doc.failedCount >= doc.recipientCount) {
      await EmailCampaign.updateOne(
        { _id: campaignId, status: { $ne: 'sent' } },
        { $set: { status: doc.sentCount === 0 ? 'failed' : 'sent', sentAt: new Date() } },
      ).exec();
    }
  } catch (error) {
    logger.error('Failed to record campaign progress', {
      campaignId,
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
};
