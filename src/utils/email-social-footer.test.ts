import { buildEmailSocialFooter } from './email-social-footer';

describe('email footer contact links', () => {
  it('includes the supplied social destinations and email-compatible PNG icons', () => {
    const html = buildEmailSocialFooter();
    expect(html).toContain('https://www.instagram.com/prem_industries_india/');
    expect(html).toContain('https://www.linkedin.com/in/prem-industries-india-limited/?isSelfProfile=true');
    expect(html).toContain('https://www.facebook.com/PremPackagingIndiaLimited/');
    expect(html).toContain('https://x.com/Prem_Packaging');
    expect((html.match(/<img /g) || []).length).toBe(5);
    expect(html).not.toMatch(/<svg|data:image/);
    ['#E4405F','#0A66C2','#1877F2','#000000','#25D366'].forEach(color => expect(html).toContain(`background-color:${color}`));
  });
  it('uses dialable and WhatsApp URLs without spaces', () => {
    const html = buildEmailSocialFooter();
    expect(html).toContain('href="tel:+918447247227"');
    expect(html).toContain('href="https://wa.me/918447247227"');
    expect(html).toContain('+91 84472 47227');
  });
});
