/**
 * MediCard — Node.js Express Backend
 * Run: npm install express cors uuid && node server.js
 * API runs on http://localhost:4000
 */

const express = require("express");
const cors    = require("cors");
const { v4: uuid } = require("uuid");

const app  = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
//  IN-MEMORY DATABASE  (replace with MongoDB/PostgreSQL in production)
// ─────────────────────────────────────────────
const DB = {
  patients:     {},   // phone → patient object
  doctors:      {},   // phone → doctor object
  labs:         {},   // phone → lab object
  pharmacists:  {},   // phone → pharmacist object
  records:      {},   // phone → [ ...visit records ]
  labReports:   {},   // phone → [ ...lab report objects ]
  appointments: {},   // phone → [ ...appointment objects ]
  vitals:       {},   // phone → { bp:[], sugar:[], weight:[] }
  prescriptions:{},   // phone → [ ...prescription objects ]
  inventory:    {},   // pharmacistPhone → [ ...medicine objects ]
  accessTokens: {},   // token → { phone, expiry }
};

// ─────────────────────────────────────────────
//  HELPER UTILITIES
// ─────────────────────────────────────────────

/** Return array or empty array for a nested DB map */
const getList = (map, key) => map[key] || [];

/** Push item into a nested DB list */
const pushTo  = (map, key, item) => {
  if (!map[key]) map[key] = [];
  map[key].push(item);
};

/** Seed demo data on first run */
function seedDemoData() {
  DB.patients["9876543210"] = {
    name: "Arjun Sharma",
    phone: "9876543210",
    dob: "1990-05-15",
    gender: "Male",
    city: "New Delhi",
    blood: "O+",
    height: "175",
    weight: "72",
    allergies: "Penicillin, Dust",
    conditions: "Mild Hypertension, Pre-Diabetes",
    emergency: "Priya Sharma — 9876543211",
  };

  DB.doctors["9988776655"] = {
    name: "Kavita Mehta",
    phone: "9988776655",
    degree: "MBBS, MD (Cardiology)",
    spec: "Cardiologist",
    exp: "14",
    hospital: "Apollo Hospital, Delhi",
    regnum: "DL-MCI-2010-4521",
    fee: "800",
  };

  DB.labs["8877665544"] = {
    name: "LifeCare Diagnostics",
    phone: "8877665544",
    city: "Mumbai",
    reg: "LAB-MH-2024-001",
    tests: "Blood CBC, Lipid Profile, X-Ray, MRI, ECG",
    established: "2010",
  };

  DB.pharmacists["7766554433"] = {
    name: "Suresh Patel",
    phone: "7766554433",
    shopName: "MediPlus Pharmacy",
    city: "Delhi",
    licenseNo: "PH-DL-2024-5678",
    registered: true,
  };

  DB.records["9876543210"] = [
    {
      id: uuid(),
      date: "2024-11-20",
      illness: "Hypertensive Episode",
      symptoms: "Headache, dizziness, BP 160/100",
      severity: "Moderate",
      prescription: "Amlodipine 5mg, Losartan 50mg",
      notes: "Monitor BP twice daily. Reduce salt.",
      followup: "2024-12-04",
      doctor: "Dr. Kavita Mehta",
      hospital: "Apollo Hospital",
      spec: "Cardiologist",
    },
    {
      id: uuid(),
      date: "2024-09-10",
      illness: "Viral Fever",
      symptoms: "Fever 102°F, body ache, fatigue",
      severity: "Mild",
      prescription: "Paracetamol 650mg, ORS, Cetirizine 10mg",
      notes: "Rest 3 days. Plenty of fluids.",
      followup: "2024-09-17",
      doctor: "Dr. Rohan Gupta",
      hospital: "Max Hospital",
      spec: "General Physician",
    },
  ];

  // Seed pharmacy inventory
  DB.inventory["7766554433"] = [
    { id: uuid(), name: "Paracetamol 650mg",   category: "Analgesic",      stock: 500, unit: "Tablet", price: 1.5,  status: "In Stock"    },
    { id: uuid(), name: "Amlodipine 5mg",      category: "Antihypertensive",stock: 200, unit: "Tablet", price: 8,    status: "In Stock"    },
    { id: uuid(), name: "Metformin 500mg",     category: "Antidiabetic",    stock: 0,   unit: "Tablet", price: 3,    status: "Out of Stock"},
    { id: uuid(), name: "Cetirizine 10mg",     category: "Antihistamine",   stock: 300, unit: "Tablet", price: 2,    status: "In Stock"    },
    { id: uuid(), name: "Losartan 50mg",       category: "Antihypertensive",stock: 80,  unit: "Tablet", price: 12,   status: "Low Stock"   },
    { id: uuid(), name: "Pantoprazole 40mg",   category: "Antacid",         stock: 150, unit: "Tablet", price: 5,    status: "In Stock"    },
  ];

  console.log("✅  Demo data seeded");
}

seedDemoData();

// ─────────────────────────────────────────────
//  AUTH ROUTES  (OTP simulation — always 123456)
// ─────────────────────────────────────────────

/** POST /api/otp/send  — simulate sending OTP */
app.post("/api/otp/send", (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone required" });
  // In production: integrate Twilio / AWS SNS here
  console.log(`OTP 123456 sent to ${phone}`);
  res.json({ success: true, message: `OTP sent to ${phone}` });
});

/** POST /api/otp/verify  — verify OTP (demo: always 123456) */
app.post("/api/otp/verify", (req, res) => {
  const { phone, otp, role } = req.body;
  if (otp !== "123456") return res.status(401).json({ error: "Invalid OTP" });

  const roleMap = {
    patient:    DB.patients,
    doctor:     DB.doctors,
    lab:        DB.labs,
    pharmacist: DB.pharmacists,
  };

  const record = roleMap[role]?.[phone];
  if (!record) return res.status(404).json({ error: "Account not found. Please register." });

  res.json({ success: true, user: record });
});

// ─────────────────────────────────────────────
//  PATIENT ROUTES
// ─────────────────────────────────────────────

app.post("/api/patients/register", (req, res) => {
  const data = req.body;
  if (!data.phone || !data.name) return res.status(400).json({ error: "Phone and name required" });
  if (DB.patients[data.phone]) return res.status(409).json({ error: "Account already exists" });
  DB.patients[data.phone] = data;
  res.json({ success: true, user: data });
});

app.get("/api/patients/:phone", (req, res) => {
  const pt = DB.patients[req.params.phone];
  if (!pt) return res.status(404).json({ error: "Patient not found" });
  res.json(pt);
});

app.get("/api/patients/:phone/records", (req, res) => {
  res.json(getList(DB.records, req.params.phone));
});

app.post("/api/patients/:phone/records", (req, res) => {
  const record = { id: uuid(), ...req.body };
  pushTo(DB.records, req.params.phone, record);
  res.json({ success: true, record });
});

app.get("/api/patients/:phone/vitals", (req, res) => {
  res.json(DB.vitals[req.params.phone] || { bp: [], sugar: [], weight: [] });
});

app.post("/api/patients/:phone/vitals", (req, res) => {
  if (!DB.vitals[req.params.phone]) {
    DB.vitals[req.params.phone] = { bp: [], sugar: [], weight: [] };
  }
  const { type, entry } = req.body;
  DB.vitals[req.params.phone][type].push(entry);
  res.json({ success: true });
});

app.get("/api/patients/:phone/appointments", (req, res) => {
  res.json(getList(DB.appointments, req.params.phone));
});

app.post("/api/patients/:phone/appointments", (req, res) => {
  const appt = { id: uuid(), status: "Confirmed", ...req.body };
  pushTo(DB.appointments, req.params.phone, appt);
  res.json({ success: true, appt });
});

app.get("/api/patients/:phone/lab-reports", (req, res) => {
  res.json(getList(DB.labReports, req.params.phone));
});

// ─────────────────────────────────────────────
//  DOCTOR ROUTES
// ─────────────────────────────────────────────

app.post("/api/doctors/register", (req, res) => {
  const data = req.body;
  if (!data.phone || !data.name) return res.status(400).json({ error: "Phone and name required" });
  DB.doctors[data.phone] = data;
  res.json({ success: true, user: data });
});

app.get("/api/doctors/:phone", (req, res) => {
  const dr = DB.doctors[req.params.phone];
  if (!dr) return res.status(404).json({ error: "Doctor not found" });
  res.json(dr);
});

// Doctor searches patient
app.get("/api/search/patient", (req, res) => {
  const { q } = req.query;
  const pt = DB.patients[q];
  if (!pt) return res.status(404).json({ error: "Patient not found" });
  const records    = getList(DB.records, q);
  const labReports = getList(DB.labReports, q);
  res.json({ patient: pt, records, labReports });
});

// ─────────────────────────────────────────────
//  LAB ROUTES
// ─────────────────────────────────────────────

app.post("/api/labs/register", (req, res) => {
  const data = req.body;
  DB.labs[data.phone] = data;
  res.json({ success: true, user: data });
});

app.post("/api/labs/:phone/upload", (req, res) => {
  const { patientPhone, report } = req.body;
  const fullReport = { id: uuid(), labPhone: req.params.phone, ...report };
  pushTo(DB.labReports, patientPhone, fullReport);
  res.json({ success: true, report: fullReport });
});

// ─────────────────────────────────────────────
//  PHARMACIST ROUTES
// ─────────────────────────────────────────────

app.post("/api/pharmacists/register", (req, res) => {
  const data = req.body;
  if (!data.phone || !data.name) return res.status(400).json({ error: "Phone and name required" });
  DB.pharmacists[data.phone] = data;
  res.json({ success: true, user: data });
});

app.get("/api/pharmacists/:phone", (req, res) => {
  const ph = DB.pharmacists[req.params.phone];
  if (!ph) return res.status(404).json({ error: "Pharmacist not found" });
  res.json(ph);
});

/** GET /api/pharmacists/:phone/inventory — get full medicine inventory */
app.get("/api/pharmacists/:phone/inventory", (req, res) => {
  res.json(getList(DB.inventory, req.params.phone));
});

/** POST /api/pharmacists/:phone/inventory — add new medicine */
app.post("/api/pharmacists/:phone/inventory", (req, res) => {
  const medicine = { id: uuid(), status: "In Stock", ...req.body };
  pushTo(DB.inventory, req.params.phone, medicine);
  res.json({ success: true, medicine });
});

/** PUT /api/pharmacists/:phone/inventory/:id — update medicine (stock, status) */
app.put("/api/pharmacists/:phone/inventory/:id", (req, res) => {
  const list = DB.inventory[req.params.phone];
  if (!list) return res.status(404).json({ error: "Inventory not found" });

  const idx = list.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Medicine not found" });

  list[idx] = { ...list[idx], ...req.body };
  res.json({ success: true, medicine: list[idx] });
});

/** DELETE /api/pharmacists/:phone/inventory/:id — remove medicine */
app.delete("/api/pharmacists/:phone/inventory/:id", (req, res) => {
  if (!DB.inventory[req.params.phone]) return res.status(404).json({ error: "Inventory not found" });
  DB.inventory[req.params.phone] = DB.inventory[req.params.phone].filter(
    m => m.id !== req.params.id
  );
  res.json({ success: true });
});

/** GET /api/pharmacists/patient/:patientPhone/prescriptions
 *  Returns all prescriptions for a patient (across all visit records)  */
app.get("/api/pharmacists/patient/:patientPhone/prescriptions", (req, res) => {
  const patient = DB.patients[req.params.patientPhone];
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const records = getList(DB.records, req.params.patientPhone);

  // Extract prescription lines from every visit record
  const prescriptions = records
    .filter(r => r.prescription)
    .map(r => ({
      visitId:      r.id,
      date:         r.date,
      doctor:       r.doctor,
      illness:      r.illness,
      prescription: r.prescription,
      // Parse comma-separated medicines into individual items
      medicines: r.prescription
        .split(",")
        .map(m => m.trim())
        .filter(Boolean),
    }));

  res.json({ patient, prescriptions });
});

/** POST /api/pharmacists/:pharmPhone/dispense — mark medicines as dispensed */
app.post("/api/pharmacists/:pharmPhone/dispense", (req, res) => {
  const { patientPhone, medicines, visitId } = req.body;
  const log = {
    id:            uuid(),
    patientPhone,
    patientName:   DB.patients[patientPhone]?.name || "Unknown",
    medicines,
    visitId,
    dispensedAt:   new Date().toISOString(),
    pharmacist:    DB.pharmacists[req.params.pharmPhone]?.name || "Unknown",
    shopName:      DB.pharmacists[req.params.pharmPhone]?.shopName || "",
  };
  pushTo(DB.prescriptions, req.params.pharmPhone, log);
  res.json({ success: true, log });
});

/** GET /api/pharmacists/:phone/dispense-history */
app.get("/api/pharmacists/:phone/dispense-history", (req, res) => {
  res.json(getList(DB.prescriptions, req.params.phone));
});

// ─────────────────────────────────────────────
//  TEMPORARY ACCESS TOKEN ROUTES
// ─────────────────────────────────────────────

app.post("/api/tokens/generate", (req, res) => {
  const { phone } = req.body;
  const token  = Math.random().toString(36).substring(2, 10).toUpperCase();
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  DB.accessTokens[token] = { phone, expiry };
  res.json({ success: true, token, expiry });
});

app.get("/api/tokens/:token", (req, res) => {
  const data = DB.accessTokens[req.params.token];
  if (!data) return res.status(404).json({ error: "Invalid token" });
  if (new Date() > new Date(data.expiry)) return res.status(410).json({ error: "Token expired" });
  const pt = DB.patients[data.phone];
  if (!pt) return res.status(404).json({ error: "Patient not found" });
  res.json({ patient: pt, records: getList(DB.records, data.phone) });
});

app.delete("/api/tokens/:token", (req, res) => {
  delete DB.accessTokens[req.params.token];
  res.json({ success: true });
});

// ─────────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n⚕️  MediCard API running on http://localhost:${PORT}`);
  console.log(`   Demo OTP for all logins: 123456\n`);
});
