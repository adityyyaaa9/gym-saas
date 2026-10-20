// Creates a new gym owner in one shot:
//  1. A Firebase Auth user (their login)
//  2. A gyms/{gymId} Firestore document linked to that user
//
// Protected by ADMIN_SECRET so only you can call this.

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    )
  });
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { gymName, ownerEmail, ownerPassword, ownerWhatsapp } = req.body;

    if (!gymName || !ownerEmail || !ownerPassword || !ownerWhatsapp) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (ownerPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // 1. Create the Auth user (the owner's login)
    const userRecord = await auth.createUser({
      email: ownerEmail,
      password: ownerPassword,
      displayName: gymName
    });

    // 2. Create their gym document
    const gymRef = await db.collection('gyms').add({
      name: gymName,
      ownerUid: userRecord.uid,
      ownerWhatsapp: ownerWhatsapp.replace(/\D/g, ''), // strip non-digits
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      ok: true,
      gymId: gymRef.id,
      ownerUid: userRecord.uid,
      signupLink: `/signup.html?gym=${gymRef.id}`
    });
  } catch (err) {
    console.error(err);
    // Common case: email already registered
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'An account with that email already exists.' });
    }
    return res.status(500).json({ error: String(err.message || err) });
  }
};
