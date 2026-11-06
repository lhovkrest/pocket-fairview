import fs from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';

/**
 * Phones only expose DeviceOrientation to secure contexts, and a LAN address is not
 * "localhost", so the controller page has to be served over HTTPS.
 *
 * Resolution order:
 *   1. SSL_KEY + SSL_CERT env vars (for example a mkcert certificate, trusted by your phone)
 *   2. a cached self-signed certificate in .certs/ that covers the current LAN addresses
 *   3. a freshly generated self-signed certificate (cached for next time)
 */
export async function loadOrCreateCert({ ips, dir }) {
  if (process.env.SSL_KEY && process.env.SSL_CERT) {
    return {
      key: fs.readFileSync(process.env.SSL_KEY),
      cert: fs.readFileSync(process.env.SSL_CERT),
      source: 'env',
    };
  }

  const wanted = [...new Set(['127.0.0.1', ...ips])].sort();
  const file = path.join(dir, 'selfsigned.json');
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    const fresh = Date.now() < cached.expires;
    const covers = wanted.every((ip) => cached.ips.includes(ip));
    if (fresh && covers) return { key: cached.key, cert: cached.cert, source: 'cache' };
  } catch {
    /* no usable cache */
  }

  const notBeforeDate = new Date();
  const notAfterDate = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'gyro-arcade.local' }], {
    algorithm: 'sha256',
    keySize: 2048,
    notBeforeDate,
    notAfterDate,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 2, value: 'gyro-arcade.local' },
          ...wanted.map((ip) => ({ type: 7, ip })),
        ],
      },
    ],
  });

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ key: pems.private, cert: pems.cert, ips: wanted, expires: notAfterDate.getTime() - 86_400_000 }),
    );
  } catch {
    /* read-only checkout: fine, we just regenerate next start */
  }
  return { key: pems.private, cert: pems.cert, source: 'generated' };
}
