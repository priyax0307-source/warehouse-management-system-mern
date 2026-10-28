import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const opts = { timestamps: true };

const userSchema = new Schema({ name: { type: String, required: true, trim: true }, email: { type: String, required: true, unique: true, lowercase: true, trim: true }, passwordHash: { type: String, required: true }, role: { type: String, enum: ['admin', 'staff'], default: 'staff' }, active: { type: Boolean, default: true } }, opts);
const productSchema = new Schema({ code: { type: String, required: true, unique: true, trim: true }, name: { type: String, required: true, trim: true }, category: { type: String, default: 'General' }, description: String, unit: { type: String, default: 'units' }, reorderLevel: { type: Number, min: 0, default: 0 }, archived: { type: Boolean, default: false } }, opts);
const warehouseSchema = new Schema({ name: { type: String, required: true }, location: String, capacity: { type: Number, min: 0, default: 0 }, status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' } }, opts);
const binSchema = new Schema({ warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true }, code: { type: String, required: true }, capacity: { type: Number, min: 0, default: 0 }, status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' } }, opts);
binSchema.index({ warehouse: 1, code: 1 }, { unique: true });
const inventorySchema = new Schema({ product: { type: Schema.Types.ObjectId, ref: 'Product', required: true }, bin: { type: Schema.Types.ObjectId, ref: 'Bin', required: true }, quantity: { type: Number, min: 0, default: 0 }, expiryDate: Date }, opts);
inventorySchema.index({ product: 1, bin: 1, expiryDate: 1 }, { unique: true });
const receivingSchema = new Schema({ reference: String, product: { type: Schema.Types.ObjectId, ref: 'Product', required: true }, quantity: { type: Number, min: 1, required: true }, supplier: { type: String, required: true }, receivedAt: { type: Date, default: Date.now }, bin: { type: Schema.Types.ObjectId, ref: 'Bin', required: true }, expiryDate: Date, status: { type: String, enum: ['Received', 'Pending'], default: 'Received' }, user: { type: Schema.Types.ObjectId, ref: 'User' } }, opts);
const pickingSchema = new Schema({ reference: String, product: { type: Schema.Types.ObjectId, ref: 'Product', required: true }, quantity: { type: Number, min: 1, required: true }, bin: { type: Schema.Types.ObjectId, ref: 'Bin', required: true }, priority: { type: String, enum: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal' }, status: { type: String, enum: ['Open', 'In Progress', 'Completed', 'Cancelled'], default: 'Open' }, requestedAt: { type: Date, default: Date.now }, user: { type: Schema.Types.ObjectId, ref: 'User' } }, opts);
const dispatchSchema = new Schema({ orderNumber: { type: String, required: true, unique: true }, product: { type: Schema.Types.ObjectId, ref: 'Product', required: true }, quantity: { type: Number, min: 1, required: true }, customer: { type: String, required: true }, dispatchedAt: { type: Date, default: Date.now }, status: { type: String, enum: ['Pending', 'Processing', 'Dispatched', 'Cancelled'], default: 'Pending' }, user: { type: Schema.Types.ObjectId, ref: 'User' } }, opts);
const cycleCountSchema = new Schema({ reference: { type: String, required: true, unique: true }, product: { type: Schema.Types.ObjectId, ref: 'Product', required: true }, bin: { type: Schema.Types.ObjectId, ref: 'Bin', required: true }, expected: { type: Number, min: 0, required: true }, counted: { type: Number, min: 0 }, variance: { type: Number, default: 0 }, status: { type: String, enum: ['Open', 'Reconciled', 'Cancelled'], default: 'Open' }, countedAt: Date, user: { type: Schema.Types.ObjectId, ref: 'User' } }, opts);
const activitySchema = new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User' }, action: String, module: String, description: String }, opts);

export const User = model('User', userSchema);
export const Product = model('Product', productSchema);
export const Warehouse = model('Warehouse', warehouseSchema);
export const Bin = model('Bin', binSchema);
export const Inventory = model('Inventory', inventorySchema);
export const Receiving = model('Receiving', receivingSchema);
export const Picking = model('Picking', pickingSchema);
export const Dispatch = model('Dispatch', dispatchSchema);
export const CycleCount = model('CycleCount', cycleCountSchema);
export const Activity = model('Activity', activitySchema);
