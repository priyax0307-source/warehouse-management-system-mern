import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Activity, Bin, CycleCount, Dispatch, Inventory, Picking, Product, Receiving, User, Warehouse } from './models.js';
import { requireAdmin, requireAuth } from './auth.js';

const api = Router();
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const tokenFor = user => jwt.sign({ sub: user._id }, process.env.JWT_SECRET, { expiresIn: '12h' });
const safeUser = user => ({ id: user._id, name: user.name, email: user.email, role: user.role });

api.post('/auth/register', asyncRoute(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 8) return res.status(400).json({ message: 'Enter a name, valid email, and password with at least 8 characters.' });
  const count = await User.countDocuments();
  const user = await User.create({ name: name.trim(), email, passwordHash: await bcrypt.hash(password, 12), role: count === 0 ? 'admin' : 'staff' });
  res.status(201).json({ token: tokenFor(user), user: safeUser(user) });
}));
api.post('/auth/login', asyncRoute(async (req, res) => {
  const user = await User.findOne({ email: (req.body.email || '').toLowerCase().trim() });
  if (!user || !user.active || !await bcrypt.compare(req.body.password || '', user.passwordHash)) return res.status(401).json({ message: 'Email or password is incorrect.' });
  res.json({ token: tokenFor(user), user: safeUser(user) });
}));
api.get('/auth/me', requireAuth, (req, res) => res.json({ user: safeUser(req.user) }));

api.use(requireAuth);
api.get('/users', requireAdmin, asyncRoute(async (_req, res) => res.json(await User.find().select('name email role active createdAt').sort('name'))));
api.patch('/users/:id/role', requireAdmin, asyncRoute(async (req, res) => {
  if (req.params.id === String(req.user._id)) return res.status(400).json({ message: 'You cannot change your own role.' });
  const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true, runValidators: true }).select('name email role active');
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.json(user);
}));

const models = { products: Product, warehouses: Warehouse, bins: Bin, inventory: Inventory, receiving: Receiving, picking: Picking, dispatch: Dispatch, cycleCounts: CycleCount, activity: Activity };
for (const [key, Model] of Object.entries(models)) {
  api.get(`/${key}`, asyncRoute(async (req, res) => {
    const filter = key === 'products' && req.query.includeArchived !== 'true' ? { archived: false } : {};
    const rows = await Model.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    const refs = key === 'inventory' ? ['product', 'bin'] : key === 'bins' ? ['warehouse'] : key === 'dispatch' ? ['product', 'user'] : key === 'activity' ? ['user'] : ['product', 'bin', 'user'];
    const populated = ['inventory', 'receiving', 'picking', 'dispatch', 'cycleCounts', 'bins', 'activity'].includes(key)
      ? await Model.find(filter).populate(refs.filter(field => ['product','bin','warehouse','user'].includes(field))).sort({ createdAt: -1 }).limit(500).lean()
      : rows;
    res.json(populated);
  }));
}

api.post('/products', asyncRoute(async (req, res) => res.status(201).json(await Product.create(req.body))));
api.patch('/products/:id', asyncRoute(async (req, res) => res.json(await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }))));
api.post('/products/:id/archive', requireAdmin, asyncRoute(async (req, res) => res.json(await Product.findByIdAndUpdate(req.params.id, { archived: true }, { new: true }))));
api.post('/products/:id/restore', requireAdmin, asyncRoute(async (req, res) => res.json(await Product.findByIdAndUpdate(req.params.id, { archived: false }, { new: true }))));
api.post('/warehouses', asyncRoute(async (req, res) => res.status(201).json(await Warehouse.create(req.body))));
api.post('/bins', asyncRoute(async (req, res) => res.status(201).json(await Bin.create(req.body))));
api.post('/cycle-counts', asyncRoute(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.body.product) || !mongoose.Types.ObjectId.isValid(req.body.bin)) return res.status(400).json({ message: 'Choose a valid product and bin.' });
  const [product, bin] = await Promise.all([Product.findOne({ _id: req.body.product, archived: false }), Bin.findOne({ _id: req.body.bin, status: 'Active' })]);
  if (!product) return res.status(404).json({ message: 'Product not found or archived.' });
  if (!bin) return res.status(404).json({ message: 'Choose an active bin.' });
  const rows = await Inventory.find({ product: product._id, bin: bin._id }).select('quantity');
  const expected = rows.reduce((sum, row) => sum + row.quantity, 0);
  const row = await CycleCount.create({ reference: `CC-${Date.now()}`, product: product._id, bin: bin._id, expected, user: req.user._id });
  await Activity.create({ user: req.user._id, action: 'Cycle count opened', module: 'Cycle counts', description: `${row.reference} opened for ${product.name} in ${bin.code}` });
  res.status(201).json(row);
}));
api.post('/search', asyncRoute(async (req, res) => {
  const q = String(req.body.q || '').trim().slice(0, 80);
  if (!q) return res.json([]);
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(safe, 'i');
  const [products, bins, warehouses, receiving, dispatch, cycleCounts] = await Promise.all([
    Product.find({ archived: false, $or: [{ name: rx }, { code: rx }] }).limit(5), Bin.find({ code: rx }).populate('warehouse').limit(5),
    Warehouse.find({ name: rx }).limit(5), Receiving.find({ supplier: rx }).populate('product').limit(5), Dispatch.find({ $or: [{ customer: rx }, { orderNumber: rx }] }).limit(5),
    CycleCount.find({ reference: rx }).populate('product').populate('bin').limit(5)
  ]);
  res.json([...products.map(x => ({ kind:'Product', title:x.name, detail:x.code })), ...bins.map(x=>({kind:'Bin',title:x.code,detail:x.warehouse?.name})), ...warehouses.map(x=>({kind:'Warehouse',title:x.name,detail:x.location})), ...receiving.map(x=>({kind:'Supplier',title:x.supplier,detail:x.product?.name})), ...dispatch.map(x=>({kind:'Dispatch',title:x.orderNumber,detail:x.customer})), ...cycleCounts.map(x=>({kind:'Cycle count',title:x.reference,detail:x.product?.name}))].slice(0,15));
}));

api.get('/dashboard', asyncRoute(async (_req, res) => {
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - 6);
  const [products, warehouses, bins, stock, pickings, receiving, dispatch, activities] = await Promise.all([
    Product.countDocuments({ archived: false }), Warehouse.countDocuments({ status: 'Active' }), Bin.countDocuments({ status: 'Active' }),
    Inventory.find().populate('product').populate({ path: 'bin', populate: { path: 'warehouse' } }).lean(),
    Picking.find({ status: { $in: ['Open', 'In Progress'] } }).populate('product').populate('bin').sort({ priority: -1, createdAt: -1 }).limit(6),
    Receiving.find().populate('product').populate('bin').sort({ createdAt: -1 }).limit(5), Dispatch.find().populate('product').sort({ createdAt: -1 }).limit(5),
    Activity.find().populate('user', 'name').sort({ createdAt: -1 }).limit(8)
  ]);
  const sums = new Map(); for (const row of stock) sums.set(String(row.product?._id), (sums.get(String(row.product?._id)) || 0) + row.quantity);
  const productDocs = await Product.find({ archived: false }).lean();
  const lowStock = productDocs.filter(p => (sums.get(String(p._id)) || 0) <= p.reorderLevel).map(p => ({ ...p, quantity: sums.get(String(p._id)) || 0 }));
  const soon = new Date(Date.now() + 30 * 864e5);
  const expiryAlerts = stock.filter(x => x.quantity > 0 && x.expiryDate && x.expiryDate <= soon).slice(0, 8);
  const categoryCounts = {}; for (const p of productDocs) categoryCounts[p.category || 'General'] = (categoryCounts[p.category || 'General'] || 0) + 1;
  const [receivedMovement, dispatchedMovement] = await Promise.all([
    Receiving.aggregate([{ $match: { receivedAt: { $gte: weekStart } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$receivedAt' } }, total: { $sum: '$quantity' } } }]),
    Dispatch.aggregate([{ $match: { status: 'Dispatched', dispatchedAt: { $gte: weekStart } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$dispatchedAt' } }, total: { $sum: '$quantity' } } }])
  ]);
  const inboundByDay = Object.fromEntries(receivedMovement.map(x => [x._id, x.total]));
  const outboundByDay = Object.fromEntries(dispatchedMovement.map(x => [x._id, x.total]));
  const movement = Array.from({ length: 7 }, (_, i) => { const date = new Date(weekStart); date.setDate(weekStart.getDate() + i); const key = date.toISOString().slice(0, 10); return { day: date.toLocaleDateString('en-US', { weekday: 'short' }), inbound: inboundByDay[key] || 0, outbound: outboundByDay[key] || 0 }; });
  res.json({ summary: { products, warehouses, bins, units: stock.reduce((n,x)=>n+x.quantity,0), lowStock: lowStock.length, openPickings: await Picking.countDocuments({ status: { $in: ['Open','In Progress'] } }), openCycleCounts: await CycleCount.countDocuments({ status: 'Open' }), pendingDispatch: await Dispatch.countDocuments({ status: { $in: ['Pending','Processing'] } }) }, lowStock, expiryAlerts, pickings, receiving, dispatch, activities, categoryCounts, movement });
}));

api.post('/receiving', asyncRoute(async (req, res) => {
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ message: 'Quantity must be a positive whole number.' });
  const session = await mongoose.startSession();
  let record;
  try { await session.withTransaction(async () => {
    const bin = await Bin.findById(req.body.bin).session(session);
    if (!bin || bin.status !== 'Active') throw Object.assign(new Error('Choose an active bin.'), { status: 400 });
    const occupied = await Inventory.aggregate([{ $match: { bin: bin._id } }, { $group: { _id: null, qty: { $sum: '$quantity' } } }]).session(session);
    if (bin.capacity > 0 && (occupied[0]?.qty || 0) + quantity > bin.capacity) throw Object.assign(new Error('This quantity exceeds the bin capacity.'), { status: 400 });
    record = await Receiving.create([{ reference: req.body.reference || `RCV-${Date.now()}`, product: req.body.product, quantity, supplier: req.body.supplier, bin: bin._id, expiryDate: req.body.expiryDate || undefined, user: req.user._id }], { session });
    const filter = { product: req.body.product, bin: bin._id, expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : null };
    await Inventory.findOneAndUpdate(filter, { $inc: { quantity }, $setOnInsert: filter }, { upsert: true, new: true, session, setDefaultsOnInsert: true });
    await Activity.create([{ user: req.user._id, action: 'Received stock', module: 'Receiving', description: `${quantity} units received from ${req.body.supplier}` }], { session });
  }); } finally { await session.endSession(); }
  res.status(201).json(record[0]);
}));

api.post('/picking', asyncRoute(async (req, res) => res.status(201).json(await Picking.create({ ...req.body, user: req.user._id, reference: req.body.reference || `PICK-${Date.now()}` }))));
api.patch('/picking/:id/status', asyncRoute(async (req, res) => {
  const allowed = ['Open','In Progress','Completed','Cancelled']; if (!allowed.includes(req.body.status)) return res.status(400).json({ message: 'Invalid picking status.' });
  const session = await mongoose.startSession(); let row;
  try { await session.withTransaction(async () => {
    row = await Picking.findById(req.params.id).session(session); if (!row) throw Object.assign(new Error('Picking task not found.'), { status: 404 });
    if (row.status !== 'Completed' && req.body.status === 'Completed') {
      const stock = await Inventory.findOne({ product: row.product, bin: row.bin, quantity: { $gte: row.quantity } }).session(session);
      if (!stock) throw Object.assign(new Error('Not enough stock in the selected bin.'), { status: 400 });
      stock.quantity -= row.quantity; await stock.save({ session });
    }
    row.status = req.body.status; await row.save({ session });
    await Activity.create([{ user: req.user._id, action: `Picking ${req.body.status.toLowerCase()}`, module: 'Picking', description: `${row.reference} marked ${req.body.status}` }], { session });
  }); } finally { await session.endSession(); }
  res.json(row);
}));

api.post('/dispatch', asyncRoute(async (req, res) => res.status(201).json(await Dispatch.create({ ...req.body, user: req.user._id }))));
api.patch('/dispatch/:id/status', asyncRoute(async (req, res) => {
  const allowed = ['Pending','Processing','Dispatched','Cancelled']; if (!allowed.includes(req.body.status)) return res.status(400).json({ message: 'Invalid dispatch status.' });
  const session = await mongoose.startSession(); let row;
  try { await session.withTransaction(async () => {
    row = await Dispatch.findById(req.params.id).session(session); if (!row) throw Object.assign(new Error('Dispatch order not found.'), { status: 404 });
    if (row.status !== 'Dispatched' && req.body.status === 'Dispatched') {
      const lots = await Inventory.find({ product: row.product, quantity: { $gt: 0 } }).sort({ expiryDate: 1 }).session(session);
      const available = lots.reduce((n, lot) => n + lot.quantity, 0); if (available < row.quantity) throw Object.assign(new Error(`Only ${available} units are available.`), { status: 400 });
      let remaining = row.quantity; for (const lot of lots) { const take = Math.min(lot.quantity, remaining); lot.quantity -= take; remaining -= take; await lot.save({ session }); if (!remaining) break; }
    }
    row.status = req.body.status; await row.save({ session });
    await Activity.create([{ user: req.user._id, action: `Dispatch ${req.body.status.toLowerCase()}`, module: 'Dispatch', description: `${row.orderNumber} marked ${req.body.status}` }], { session });
  }); } finally { await session.endSession(); }
  res.json(row);
}));

api.post('/cycle-counts/:id/reconcile', asyncRoute(async (req, res) => {
  const counted = Number(req.body.counted);
  if (!Number.isInteger(counted) || counted < 0) return res.status(400).json({ message: 'Enter a non-negative whole-number count.' });
  const session = await mongoose.startSession(); let row;
  try { await session.withTransaction(async () => {
    row = await CycleCount.findById(req.params.id).session(session);
    if (!row) throw Object.assign(new Error('Cycle count not found.'), { status: 404 });
    if (row.status !== 'Open') throw Object.assign(new Error('Only open cycle counts can be reconciled.'), { status: 409 });
    const lots = await Inventory.find({ product: row.product, bin: row.bin }).session(session);
    lots.sort((a,b)=>(a.expiryDate?.getTime()??Number.POSITIVE_INFINITY)-(b.expiryDate?.getTime()??Number.POSITIVE_INFINITY));
    const current = lots.reduce((sum, lot) => sum + lot.quantity, 0), delta = counted - current;
    if (delta > 0) {
      const filter = { product: row.product, bin: row.bin, expiryDate: null };
      await Inventory.findOneAndUpdate(filter, { $inc: { quantity: delta }, $setOnInsert: filter }, { upsert: true, new: true, session, setDefaultsOnInsert: true });
    } else if (delta < 0) {
      let remaining = -delta;
      for (const lot of lots) { const take = Math.min(lot.quantity, remaining); lot.quantity -= take; remaining -= take; await lot.save({ session }); if (!remaining) break; }
    }
    row.counted = counted; row.variance = counted - row.expected; row.status = 'Reconciled'; row.countedAt = new Date(); row.user = req.user._id; await row.save({ session });
    await Activity.create([{ user: req.user._id, action: 'Cycle count reconciled', module: 'Cycle counts', description: `${row.reference}: expected ${row.expected}, counted ${counted}, variance ${row.variance >= 0 ? '+' : ''}${row.variance}` }], { session });
  }); } finally { await session.endSession(); }
  res.json(row);
}));

api.get('/reports/:type', asyncRoute(async (req, res) => {
  const map = { inventory: Inventory, receiving: Receiving, picking: Picking, dispatch: Dispatch, cycleCounts: CycleCount };
  const Model = map[req.params.type]; if (!Model) return res.status(404).json({ message: 'Report not found.' });
  let query = Model.find();
  if (req.params.type === 'inventory') query = query.populate('product').populate({ path: 'bin', populate: { path: 'warehouse' } });
  if (['receiving','picking'].includes(req.params.type)) query = query.populate('product').populate('bin').populate('user', 'name');
  if (req.params.type === 'dispatch') query = query.populate('product').populate('user', 'name');
  if (req.params.type === 'cycleCounts') query = query.populate('product').populate('bin').populate('user', 'name');
  const from = req.query.from ? new Date(req.query.from) : null, to = req.query.to ? new Date(req.query.to) : null;
  if (from || to) query = query.where('createdAt').gte(from || new Date(0)).lte(to || new Date());
  res.json(await query.sort({ createdAt: -1 }).limit(1000));
}));

export default api;
