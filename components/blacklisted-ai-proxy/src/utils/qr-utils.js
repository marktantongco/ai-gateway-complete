import qrcode from 'qrcode-terminal';

/**
 * Print an OAuth URL as a QR code in the terminal.
 * @param {string} url - The OAuth consent URL to encode
 * @param {string} [label] - Optional label to show above QR
 */
export function printAuthQR(url, label = 'Scan to open auth page') {
    console.log(`\n${label}:`);
    qrcode.generate(url, { small: true }, (qr) => {
        console.log(qr);
    });
    console.log(`\nOr open directly: ${url}\n`);
}

/**
 * Generate QR code as ASCII string (for Web UI or logging).
 * @param {string} url - The URL to encode
 * @returns {Promise<string>} ASCII QR string
 */
export async function generateQRString(url) {
    return new Promise((resolve, reject) => {
        qrcode.generate(url, { small: true, output: 'terminal' }, (qr) => {
            resolve(qr);
        });
    });
}
