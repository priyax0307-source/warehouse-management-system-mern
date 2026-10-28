import 'dotenv/config';
import mongoose from 'mongoose';
import { Activity, Bin, CycleCount, Dispatch, Inventory, Picking, Product, Receiving, Warehouse } from './models.js';

if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in server/.env');
await mongoose.connect(process.env.MONGODB_URI);

const collections = [Product, Warehouse, Bin, Inventory, Receiving, Picking, Dispatch, CycleCount];
const existing = await Promise.all(collections.map(Model => Model.countDocuments()));
if (existing.some(Boolean)) {
  console.log('Seed skipped: the Stockroom database already contains warehouse records.');
  await mongoose.disconnect();
  process.exit(0);
}

const ago = days => new Date(Date.now() - days * 864e5);
const productsData = [
  ['SKU-1001','Industrial Safety Gloves','Safety','pairs',40],
  ['SKU-1002','Protective Safety Glasses','Safety','units',24],
  ['SKU-1003','Packing Tape 48 mm','Packaging','rolls',36],
  ['SKU-1004','Corrugated Shipping Box - Medium','Packaging','units',50],
  ['SKU-1005','Stretch Wrap Film','Packaging','rolls',18],
  ['SKU-1006','Thermal Shipping Labels','Office supplies','rolls',20],
  ['SKU-1007','USB Barcode Scanner','Equipment','units',8],
  ['SKU-1008','Pallet Jack Wheel Kit','Equipment','kits',6],
  ['SKU-1009','Cleaning Solution 5 L','Janitorial','bottles',12],
  ['SKU-1010','Absorbent Spill Pads','Safety','packs',15],
  ['SKU-1011','Cable Ties 200 mm','Hardware','packs',30],
  ['SKU-1012','Workstation Marker Pens','Office supplies','packs',10],
];
const inbound = [55,32,80,90,34,42,12,9,26,24,65,21];
const shipped = [14,8,32,38,10,16,3,2,8,6,20,5];
const soonExpiry = new Date(Date.now() + 14 * 864e5);
const products = await Product.insertMany(productsData.map(([code,name,category,unit,reorderLevel], i) => ({ code,name,category,unit,reorderLevel,description:`${category} stock item for warehouse operations.`,createdAt:ago(40-i),updatedAt:ago(40-i) })));
const warehouses = await Warehouse.insertMany([
  { name:'Central Distribution Centre', location:'Bengaluru, Karnataka', capacity:12000, status:'Active' },
  { name:'South Regional Store', location:'Chennai, Tamil Nadu', capacity:6500, status:'Active' },
]);
const binDefs = [
  ['A-01-01',warehouses[0],1400],['A-01-02',warehouses[0],1400],['A-02-01',warehouses[0],1100],['B-01-01',warehouses[0],900],
  ['C-01-01',warehouses[1],900],['C-01-02',warehouses[1],900],['D-01-01',warehouses[1],750],['D-02-01',warehouses[1],750],
];
const bins = await Bin.insertMany(binDefs.map(([code,warehouse,capacity])=>({code,warehouse:warehouse._id,capacity,status:'Active'})));
const stockRows = [];
for (let i=0;i<products.length;i++) {
  const bin = bins[i%bins.length];
  const quantity = 34 + (i*17)%96;
  stockRows.push({product:products[i]._id,bin:bin._id,quantity,createdAt:ago(12+i%8),updatedAt:ago(1)});
}
stockRows.push({product:products[5]._id,bin:bins[5]._id,quantity:9,expiryDate:soonExpiry,createdAt:ago(10),updatedAt:ago(1)});
await Inventory.insertMany(stockRows);
await CycleCount.create({ reference:'CC-2026-0001', product:products[0]._id, bin:bins[0]._id, expected:stockRows[0].quantity, status:'Open' });
const supplierNames = ['Apex Industrial Supply','BluePeak Packaging','Metro Safety Traders','Northstar Equipment Co.'];
await Receiving.insertMany(products.map((product,i)=>({
  reference:`RCV-2026-${String(1001+i).padStart(4,'0')}`,product:product._id,quantity:inbound[i],supplier:supplierNames[i%supplierNames.length],
  bin:bins[i%bins.length]._id,...(i===5?{expiryDate:soonExpiry}:{}),receivedAt:ago(1+(i*3)%24),status:'Received',createdAt:ago(1+(i*3)%24),updatedAt:ago(1+(i*3)%24),
})));
const pickingRows = [
  {reference:'PICK-2041',product:products[0],quantity:6,bin:bins[0],priority:'High',status:'Open',days:0},
  {reference:'PICK-2040',product:products[2],quantity:10,bin:bins[2],priority:'Normal',status:'In Progress',days:1},
  {reference:'PICK-2039',product:products[3],quantity:12,bin:bins[3],priority:'Urgent',status:'Open',days:1},
  {reference:'PICK-2038',product:products[6],quantity:2,bin:bins[6],priority:'Low',status:'Completed',days:3},
  {reference:'PICK-2037',product:products[9],quantity:3,bin:bins[5],priority:'Normal',status:'Completed',days:5},
];
await Picking.insertMany(pickingRows.map(({days,...row})=>({...row,requestedAt:ago(days),createdAt:ago(days),updatedAt:ago(days)})));
const customers=['Harbor Retail Group','Evergreen Manufacturing','Cedar & Stone Market','Atlas Fulfilment','Brightline Stores','Coastal Supply Partners'];
await Dispatch.insertMany(products.slice(0,6).map((product,i)=>({
  orderNumber:`ORD-2026-${String(301+i).padStart(4,'0')}`,customer:customers[i],product,quantity:shipped[i],
  status:['Dispatched','Dispatched','Processing','Pending','Dispatched','Pending'][i],dispatchedAt:ago([1,2,0,0,4,0][i]),
  createdAt:ago([1,2,1,0,4,0][i]),updatedAt:ago([1,2,1,0,4,0][i]),
})));
await Activity.insertMany([
  {action:'Workspace seeded',module:'Setup',description:'Sample warehouse catalogue and operating activity added.'},
  {action:'Stock received',module:'Receiving',description:'Sample receipts added for warehouse reporting.'},
  {action:'Orders prepared',module:'Dispatch',description:'Sample customer orders added for dispatch tracking.'},
  {action:'Cycle count opened',module:'Cycle counts',description:'CC-2026-0001 opened for a stock verification example.'},
].map((row,i)=>({...row,createdAt:ago(i),updatedAt:ago(i)})));
console.log(`Seed complete: ${products.length} products, ${warehouses.length} warehouses, ${bins.length} bins, ${stockRows.length} stock records, ${inbound.length} receipts, ${pickingRows.length} pick tasks, 6 dispatch orders.`);
await mongoose.disconnect();
