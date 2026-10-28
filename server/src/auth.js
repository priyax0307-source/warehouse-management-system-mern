import jwt from 'jsonwebtoken';
import { User } from './models.js';

export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ message: 'Sign in to continue.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select('name email role active');
    if (!user?.active) return res.status(401).json({ message: 'Your account is unavailable.' });
    req.user = user;
    next();
  } catch { res.status(401).json({ message: 'Your session has expired. Please sign in again.' }); }
}

export const requireAdmin = (req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ message: 'Administrator access required.' });
