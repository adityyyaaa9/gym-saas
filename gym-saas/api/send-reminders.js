// Runs once a day (see vercel.json — 03:30 UTC = 9:00 AM IST).
// For every active gym, finds members whose membership expires TOMORROW,
// and sends the owner ONE WhatsApp template message per expiring member.

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    )
  });
}

const db = admin.firestore();

function tomorrowDateString() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0]; // "YYYY-MM-DD"
}

async function sendWhatsAppTemplate(toNumber, memberName, expiryDateFormatted) {
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: toNumber,
    type: 'template',
    template: {
      name: process.env.WHATSAPP_TEMPLATE_NAME, // e.g. "membership_expiry_reminder"
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: memberName },
            { type: 'text', text: expiryDateFormatted }
          ]
        }
      ]
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('WhatsApp send failed:', JSON.stringify(data));
  }
  return res.ok;
}

module.exports = async (req, res) => {
  // Protect this endpoint — only Vercel's own cron (or you, manually) should trigger it.
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const targetDate = tomorrowDateString();
  const results = [];

  try {
    const gymsSnap = await db.collection('gyms').where('active', '==', true).get();

    for (const gymDoc of gymsSnap.docs) {
      const gym = gymDoc.data();

      const membersSnap = await gymDoc.ref
        .collection('members')
        .where('status', '==', 'active')
        .where('expiryDate', '==', targetDate)
        .where('reminderSent', '==', false)
        .get();

      for (const memberDoc of membersSnap.docs) {
        const member = memberDoc.data();
        const [y, m, d] = member.expiryDate.split('-');
        const formatted = `${d}/${m}/${y}`;

        const ok = await sendWhatsAppTemplate(gym.ownerWhatsapp, member.name, formatted);

        if (ok) {
          await memberDoc.ref.update({ reminderSent: true });
        }

        results.push({ gym: gym.name, member: member.name, sent: ok });
      }
    }

    return res.status(200).json({ date: targetDate, remindersSent: results.length, results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err) });
  }
};
