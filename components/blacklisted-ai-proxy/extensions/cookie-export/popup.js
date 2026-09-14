const DOMAINS = ['grok.com', 'x.com', 'www.x.com'];

async function getCookiesForDomain(domain) {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain }, resolve);
  });
}

function findCookie(cookies, name) {
  return cookies.find(c => c.name === name);
}

document.getElementById('export').addEventListener('click', async () => {
  const status = document.getElementById('status');
  status.className = '';
  status.textContent = 'Fetching cookies...';

  try {
    const grokCookies = await getCookiesForDomain('grok.com');
    const allXCookies = [
      ...await getCookiesForDomain('x.com'),
      ...await getCookiesForDomain('www.x.com')
    ];

    const ssoToken = findCookie(grokCookies, 'sso')
      || findCookie(allXCookies, 'sso')
      || findCookie(allXCookies, 'auth_token');

    const cfClearance = findCookie(grokCookies, 'cf_clearance')
      || findCookie(allXCookies, 'cf_clearance');

    const userAgent = navigator.userAgent;

    const session = {
      GROK_COOKIE_TOKEN: ssoToken ? ssoToken.value : '',
      GROK_CF_CLEARANCE: cfClearance ? cfClearance.value : '',
      GROK_USER_AGENT: userAgent,
      exportedAt: new Date().toISOString()
    };

    await navigator.clipboard.writeText(JSON.stringify(session, null, 2));

    status.className = 'success';
    const hasToken = session.GROK_COOKIE_TOKEN ? 'SSO token found' : 'No SSO token found';
    const hasCF = session.GROK_CF_CLEARANCE ? 'CF clearance found' : 'No CF clearance';
    status.textContent = `Copied. ${hasToken}, ${hasCF}. Paste in proxy Web UI.`;
  } catch (err) {
    status.className = 'error';
    status.textContent = `Error: ${err.message}`;
  }
});
