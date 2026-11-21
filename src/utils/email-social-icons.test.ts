import { buildEmailSocialFooter } from './email-social-footer';
import { inlineSocialIconsForPreview, socialIconAttachments } from './email-social-icons';

describe('bundled email footer icons', () => {
  it('attaches all five footer icons as valid inline PNGs', () => {
    const html = buildEmailSocialFooter();
    const attachments = socialIconAttachments(html);
    expect(attachments).toHaveLength(5);
    attachments.forEach(attachment => {
      expect(html).toContain(`cid:${attachment.cid}`);
      expect(attachment.content.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(attachment.contentDisposition).toBe('inline');
    });
  });
  it('uses browser-displayable images in previews without external asset URLs', () => {
    const preview = inlineSocialIconsForPreview(buildEmailSocialFooter());
    expect(preview).not.toContain('cid:');
    expect((preview.match(/data:image\/png;base64,/g) || [])).toHaveLength(5);
    expect(socialIconAttachments('<p>No footer</p>')).toEqual([]);
  });
});
