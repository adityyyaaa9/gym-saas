// Just checks whether the given secret matches ADMIN_SECRET. No side effects.
module.exports = async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret === process.env.ADMIN_SECRET) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ ok: false });
};
