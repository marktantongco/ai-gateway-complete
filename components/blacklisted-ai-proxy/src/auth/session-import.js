import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.js';

const CONFIG_FILE = path.join(process.cwd(), 'configs', 'config.json');

/**
 * Handle POST /api/auth/import-session
 * Accepts JSON body with Grok/X session cookies and writes them to config.json.
 *
 * Body: { GROK_COOKIE_TOKEN, GROK_CF_CLEARANCE, GROK_USER_AGENT }
 */
export async function handleSessionImport(req, res) {
    try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = JSON.parse(raw);

        const { GROK_COOKIE_TOKEN, GROK_CF_CLEARANCE, GROK_USER_AGENT } = body;

        if (!GROK_COOKIE_TOKEN && !GROK_CF_CLEARANCE) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Provide at least GROK_COOKIE_TOKEN or GROK_CF_CLEARANCE' }));
            return;
        }

        let config = {};
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            }
        } catch {
            logger.warn('[SessionImport] Could not read config.json, will create new');
        }

        if (GROK_COOKIE_TOKEN) config.GROK_COOKIE_TOKEN = GROK_COOKIE_TOKEN;
        if (GROK_CF_CLEARANCE) config.GROK_CF_CLEARANCE = GROK_CF_CLEARANCE;
        if (GROK_USER_AGENT) config.GROK_USER_AGENT = GROK_USER_AGENT;

        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 4), 'utf8');

        logger.info('[SessionImport] Config updated. Restart required for changes to take effect.');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            message: 'Session imported. Restart the proxy for changes to take effect.',
            hasToken: !!GROK_COOKIE_TOKEN,
            hasCF: !!GROK_CF_CLEARANCE,
        }));
    } catch (err) {
        logger.error('[SessionImport] Error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
}
