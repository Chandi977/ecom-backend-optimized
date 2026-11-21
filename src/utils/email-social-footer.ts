const SOCIAL_LINKS = [
  { name: 'Instagram', icon: 'instagram', color: '#E4405F', href: 'https://www.instagram.com/prem_industries_india/' },
  { name: 'LinkedIn', icon: 'linkedin', color: '#0A66C2', href: 'https://www.linkedin.com/in/prem-industries-india-limited/?isSelfProfile=true' },
  { name: 'Facebook', icon: 'facebook', color: '#1877F2', href: 'https://www.facebook.com/PremPackagingIndiaLimited/' },
  { name: 'X', icon: 'x', color: '#000000', href: 'https://x.com/Prem_Packaging' },
  { name: 'WhatsApp', icon: 'whatsapp', color: '#25D366', href: 'https://wa.me/918447247227' },
];

export const buildEmailSocialFooter = (): string => `
  <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 14px;border-collapse:collapse;">
    <tr>${SOCIAL_LINKS.map(({ name, icon, href, color }) => `<td align="center" style="padding:0 7px;"><a href="${href}" target="_blank" aria-label="${name}" style="display:inline-block;text-decoration:none;"><img src="cid:prem-social-${icon}" width="22" height="22" alt="${name}" style="display:block;width:22px;height:22px;border:0;padding:8px;border-radius:8px;background-color:${color};color:#ffffff;font:10px Arial;"></a></td>`).join('')}</tr>
  </table>
  <p style="font-size:12px;color:#c8d2e6;margin:0 0 14px;line-height:1.5;"><a href="tel:+918447247227" style="color:#ffffff;text-decoration:none;">Call +91 84472 47227</a> &nbsp;&bull;&nbsp; <a href="https://wa.me/918447247227" target="_blank" style="color:#ffffff;text-decoration:none;">Chat on WhatsApp</a></p>`;
